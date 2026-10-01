"""Independently reconcile an exported monthly order workbook to its source."""
import argparse
from collections import defaultdict
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import unicodedata

from openpyxl import load_workbook


def decimal(value):
    return Decimal(str(value).replace(',', '').strip())


def close(actual, expected, tolerance=Decimal('0.0001')):
    assert actual is not None, 'Missing cached formula value'
    assert abs(decimal(actual) - decimal(expected)) <= tolerance, (actual, expected)


def text(value, upper=False):
    if value is None or not str(value).strip():
        return '미기록'
    value = unicodedata.normalize('NFC', str(value).strip())
    return value.upper() if upper else value.lower()


def verify(source, report_dir):
    d = json.loads((report_dir / 'aggregates/order-analysis.json').read_text(encoding='utf-8'))
    assert len(d['sources']) == 1, 'Verifier expects one monthly source'
    assert source.name == d['sources'][0]['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest() == d['sources'][0]['sha256'], 'Source changed'
    expected = []
    src = load_workbook(source, read_only=True, data_only=True)
    for row_number, values in enumerate(src.active.iter_rows(values_only=True), 1):
        if all(v is None for v in values):
            continue
        assert len(values) == 9
        status = 'blank' if values[5] is None or str(values[5]).strip() == '' else str(int(decimal(values[5])))
        status_meta = d['scope']['status_mapping'].get(status, {'label': f'상태 {status}(정의 미확인)', 'group': 'unknown'})
        expected.append({
            'month': f'20{source.stem[:2]}-{source.stem[2:]}',
            **dict(zip(['currency', 'country', 'city', 'industry', 'language'],
                       [text(v, i < 2) for i, v in enumerate(values[:5])])),
            'status': status, 'status_label': status_meta['label'], 'status_group': status_meta['group'],
            'product_amount': decimal(values[6]), 'final_amount': decimal(values[7]),
            'orders': int(decimal(values[8])), 'source_row': row_number,
        })
    src.close()
    assert len(expected) == len(d['rows']) == d['scope']['aggregate_rows']
    for original, normalized in zip(expected, d['rows']):
        for field, value in original.items():
            assert value == (decimal(normalized[field]) if field.endswith('_amount') else normalized[field]), field

    partitions = {
        'monthly': ['month'], 'status': ['status', 'status_label', 'status_group'],
        'countries': ['country'], 'cities': ['country', 'city'], 'languages': ['language'],
        'industries': ['industry'], 'country_language': ['country', 'language'],
        'country_industry': ['country', 'industry'], 'currency': ['currency'],
        'monthly_country': ['month', 'country'], 'monthly_language': ['month', 'language'],
    }
    for table, dimensions in partitions.items():
        independent = defaultdict(lambda: defaultdict(int))
        for r in expected:
            key = tuple(r[k] for k in dimensions)
            independent[key]['orders'] += r['orders']
            independent[key][r['status_group']] += r['orders']
        assert len(independent) == len(d[table]), table
        for group in d[table]:
            key = tuple(group[k] for k in dimensions)
            assert group['orders'] == independent[key]['orders'], table
            for status_group, count_field in [('completed', 'completed_orders'), ('cancelled', 'cancelled_orders'),
                                               ('known_other', 'known_other_orders'), ('unknown', 'unknown_status_orders')]:
                assert group[count_field] == independent[key][status_group], table
    total = sum(r['orders'] for r in expected)
    assert total == d['totals']['orders']
    name = f"주문집계_20{source.stem}_분석.xlsx"
    report = report_dir / name
    values = load_workbook(report, data_only=True)
    formulas = load_workbook(report, data_only=False)
    raw = values['집계자료']
    assert raw.max_row == len(expected) + 5
    for n, r in enumerate(expected, 6):
        wanted = [r['month'], r['currency'], r['country'], r['city'], r['industry'], r['language'],
                  '공란' if r['status'] == 'blank' else r['status'], r['status_label'], r['status_group'],
                  r['product_amount'], r['final_amount'], r['orders'], r['source_row']]
        for col, item in enumerate(wanted, 1):
            actual = raw.cell(n, col).value
            if isinstance(item, Decimal):
                close(actual, item)
            else:
                assert actual == item, (n, col)
    close(values['주문요약'].cell(7 + len(d['status']), 2).value, total)
    for i, r in enumerate(d['status'], 7):
        assert values['주문요약'].cell(i, 1).value == r['status_label']
        close(values['주문요약'].cell(i, 2).value, r['orders'])
    for sheet_name, start, table in [('국가도시', 7, 'countries'), ('언어업종', 7, 'languages'), ('언어업종', 18, 'industries')]:
        for i, r in enumerate(d[table], start):
            for col, count in [(2, r['orders']), (3, r['completed_orders']), (4, r['cancelled_orders']),
                               (5, r['known_other_orders'] + r['unknown_status_orders'])]:
                close(values[sheet_name].cell(i, col).value, count)
            close(values[sheet_name].cell(i, 6).value, r['orders'] / total)
            close(values[sheet_name].cell(i, 7).value, r['cancellation_rate'])
    for i, r in enumerate(d['cities'], 21):
        close(values['국가도시'].cell(i, 3).value, r['orders'])
        close(values['국가도시'].cell(i, 4).value, r['completed_orders'])
        close(values['국가도시'].cell(i, 5).value, r['cancelled_orders'])
    for i, country in enumerate(d['countries'], 7):
        for j, language in enumerate(d['languages'], 2):
            count = sum(r['orders'] for r in expected if r['country'] == country['country'] and r['language'] == language['language'])
            close(values['국가언어'].cell(i, j).value, count)
    for i, r in enumerate(d['currency'], 7):
        completed = [x for x in expected if x['currency'] == r['currency'] and x['status_group'] == 'completed']
        product = sum((x['product_amount'] for x in completed), Decimal(0))
        final = sum((x['final_amount'] for x in completed), Decimal(0))
        assert product == decimal(r['completed_product_amount'])
        assert final == decimal(r['completed_final_amount'])
        close(values['통화금액'].cell(i, 2).value, r['completed_orders'])
        close(values['통화금액'].cell(i, 3).value, product)
        close(values['통화금액'].cell(i, 4).value, final)
        if d['scope']['amounts_are_sums_confirmed'] and completed:
            close(values['통화금액'].cell(i, 5).value, final / r['completed_orders'])
        close(values['통화금액'].cell(i, 6).value, final - product)
    formula_count = 0
    for sheet in formulas:
        for row in sheet:
            for cell in row:
                cached = values[sheet.title][cell.coordinate]
                assert cached.data_type != 'e', (sheet.title, cell.coordinate, cached.value)
                if cell.data_type == 'f':
                    formula_count += 1
                    assert cached.value is not None, (sheet.title, cell.coordinate)
    assert len(formulas['주문요약']._charts) == 1, 'Missing country chart'
    result = {'passed': True, 'source_rows': len(expected), 'orders': total, 'formula_cells': formula_count,
              'source_hash_matches': True, 'first_row_included': True, 'partitions_reconciled': len(partitions),
              'currency_amounts_reconciled': True, 'admin_total_matches': d['scope']['admin_total_matches']}
    values.close()
    formulas.close()
    (report_dir / 'order-verification.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--report-dir', type=Path, required=True)
    args = parser.parse_args()
    verify(args.input, args.report_dir)
