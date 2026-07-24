import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { PATHS } from "./config.js";

// Posts the monthly-pipeline reminder to Slack #이나래 via a Slack BOT token (chat.postMessage).
// A bot-authored message shows up as unread + notifies the user (unlike a self-authored message,
// which Slack marks read immediately). Uses the raw Slack Web API with a bot token — NO dependency
// on the claude.ai Slack MCP connector, so this works both locally AND inside a cloud routine
// (there, run the equivalent curl with the token baked into the routine prompt).
//
// Setup: create a Slack app with the `chat:write` bot scope, install it, invite the bot to #이나래,
// and save its `xoxb-...` token to the file below. See RUNBOOK.md "Slack 봇 토큰 설정".

const BOT_TOKEN_FILE = path.join(PATHS.secrets, "slack_bot_token.txt");
const CHANNEL_ID = "C0BH0UCH8FN"; // #이나래
const SELF_USER_ID = "U0BFTMSF24D"; // 이나래 — mentioned so it double-pings

function readBotToken() {
  if (!fs.existsSync(BOT_TOKEN_FILE)) {
    throw new Error(
      `Slack bot token not found at ${BOT_TOKEN_FILE}.\n` +
        `Create a Slack app with the 'chat:write' bot scope, install it, invite the bot to #이나래,\n` +
        `then save its xoxb-... token to that file. See RUNBOOK.md.`
    );
  }
  return fs.readFileSync(BOT_TOKEN_FILE, "utf8").trim();
}

function prevMonthKey() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildMessage(targetMonth) {
  const [, mm] = targetMonth.split("-");
  const monthNum = Number(mm);
  const isQuarterEnd = [3, 6, 9, 12].includes(monthNum);
  return (
    `<@${SELF_USER_ID}> *배달K 월간 마케팅 리포트* (매월 5일) — 대상월 *${targetMonth}*\n\n` +
    `로컬 PC(Claude Code)에서 진행하세요.\n\n` +
    `*1. 파일 드롭* → \`Desktop\\DK_monthly\\data\\\`\n` +
    `  - AppsFlyer raw: iOS/AOS 각각 installs·in-app-events·organic-installs·organic-in-app-events (af_ios_raw / af_aos_raw)\n` +
    `  - 앱DB 엑셀 (app_db, *국가·업종·도시 컬럼 포함*)\n` +
    `  - 매체 광고비 CSV (af_ads, AppsFlyer platform-table export·USD, *그 달 기간으로* export) — CAC/ROAS용\n\n` +
    `*2. 한 번에 실행* (tools/dk-monthly-pipeline)\n` +
    `  \`node run-month.js --month=${targetMonth}\`\n` +
    `  → 분석 · 채널 신규귀속(활성화·순LTV) · 채널 광고비/CAC · 마스터 엑셀${isQuarterEnd ? " · *분기 리포트*" : ""} 까지 자동. 끝에 요약 출력.\n\n` +
    `*3. 노션 발행* (RUNBOOK 3)\n` +
    `  - 월간 리포트: 기본 + 확장지표(AOV·채널품질·활성화·빈도) + 수익성(테이크레이트·손익분기) + 채널 성과(신규귀속) — 이모지 없이, "해석 —" 스타일\n` +
    `  - MAU·요일 DB 갱신, 코호트 리텐션(CUID) 갱신\n\n` +
    `*4. 슬랙 캔버스 갱신* (RUNBOOK 4)\n` +
    (isQuarterEnd
      ? `\n⚠️ *분기 마감월* — 분기 리포트(8시트) 자동 생성 + 노션 분기 종합 페이지(Q1~Q4)도 작성.\n`
      : "") +
    `\n판단 원칙: 광고는 ROAS 아닌 *LTV/CAC*로. 대시보드 ROAS는 과대(참고용). — 노션 "광고 채널 성과·평가(LTV/CAC)" 참고.`
  );
}

function postMessage(token, channel, text) {
  const payload = JSON.stringify({ channel, text, unfurl_links: false });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "slack.com",
        path: "/api/chat.postMessage",
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (!json.ok) reject(new Error(`Slack API error: ${json.error}`));
            else resolve(json);
          } catch (e) {
            reject(new Error(`Bad Slack response: ${body.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function run() {
  const monthArg = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];
  const targetMonth = monthArg || prevMonthKey();
  const token = readBotToken();
  const text = buildMessage(targetMonth);
  const res = await postMessage(token, CHANNEL_ID, text);
  console.log(`Reminder posted to #이나래 (ts=${res.ts}) for target month ${targetMonth}.`);
}

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
