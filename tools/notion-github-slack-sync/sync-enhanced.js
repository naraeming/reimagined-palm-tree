import { promises as fs } from 'node:fs';
import { config, validateConfig } from './config.js';
import { NotionExporter } from './notion-export.js';
import { AdsExtractor } from './data-extractors/ads-extractor.js';
import { ContentExtractor } from './data-extractors/content-extractor.js';
import { PerformanceExtractor } from './data-extractors/performance-extractor.js';
import { BriefingExtractor } from './data-extractors/briefing-extractor.js';
import { AdsCanvasBuilder } from './canvas-builders/ads-canvas-builder.js';
import { ContentCanvasBuilder } from './canvas-builders/content-canvas-builder.js';
import { PerformanceCanvasBuilder } from './canvas-builders/performance-canvas-builder.js';
import { BriefingCanvasBuilder } from './canvas-builders/briefing-canvas-builder.js';
import { SlackNotifier } from './slack-notify.js';
import { CrossReference } from './cross-reference.js';

async function main() {
  try {
    console.log('🚀 Notion → GitHub → Slack 포괄 동기화 시작...\n');

    validateConfig();

    // 데이터 추출
    console.log('📊 Step 1: Notion에서 데이터 추출 중...');
    const [adsData, contentData, performanceData, briefingData] = await Promise.all([
      new AdsExtractor(config.notionToken).extractAll(),
      new ContentExtractor(config.notionToken).extractAll(),
      new PerformanceExtractor(config.notionToken).extractAll(),
      new BriefingExtractor(config.notionToken).extractLatest(7),
    ]);

    console.log(`✅ 광고: ${adsData.campaigns.length}개 캠페인, ${adsData.materials.length}개 소재`);
    console.log(`✅ 콘텐츠: ${contentData.calendar.length}개 포스트, ${contentData.topics.length}개 주제`);
    console.log(`✅ 성과: ${performanceData.monthly.length}개월 리포트`);
    console.log(`✅ 브리핑: ${briefingData.briefings.length}개 항목\n`);

    // Canvas 생성
    console.log('🎨 Step 2: Slack Canvas 콘텐츠 생성 중...');
    const adsCanvas = new AdsCanvasBuilder().build(adsData);
    const contentCanvas = new ContentCanvasBuilder().build(contentData);
    const performanceCanvas = new PerformanceCanvasBuilder().build(performanceData);
    const briefingCanvas = new BriefingCanvasBuilder().build(briefingData);

    console.log('✅ 4개 Canvas 콘텐츠 생성 완료\n');

    // 교차 참조
    console.log('🔗 Step 3: 광고-콘텐츠 연동 정보 생성 중...');
    const crossRef = new CrossReference();
    const mapping = crossRef.generateMapping(adsData.campaigns, adsData.materials, contentData.calendar);

    const enrichedAdsCanvas = crossRef.enrichAdsCanvas(adsCanvas, mapping.adToContent);
    const enrichedContentCanvas = crossRef.enrichContentCanvas(contentCanvas, mapping.contentToAd);

    console.log(`✅ 연동 정보: ${mapping.totalConnections}개 연결 발견\n`);

    // Slack 알림
    console.log('💬 Step 4: Slack에 Canvas 발송 중...');
    const slackNotifier = new SlackNotifier(config.slackBotToken, config.slackChannelId, config.dryRun);

    if (!config.dryRun) {
      // 캔버스 생성/업데이트
      const canvasIds = {
        ads: null,
        content: null,
        performance: null,
        briefing: null,
      };

      // 광고 Canvas
      if (!canvasIds.ads) {
        const result = await slackNotifier.createCanvas('📢 광고 운영 관리', enrichedAdsCanvas);
        if (result.success) {
          canvasIds.ads = result.canvasId;
          console.log('✅ 광고 Canvas 생성됨');
        }
      }

      // 콘텐츠 Canvas
      if (!canvasIds.content) {
        const result = await slackNotifier.createCanvas('✍️ 콘텐츠 제작 관리', enrichedContentCanvas);
        if (result.success) {
          canvasIds.content = result.canvasId;
          console.log('✅ 콘텐츠 Canvas 생성됨');
        }
      }

      // 성과 Canvas
      if (!canvasIds.performance) {
        const result = await slackNotifier.createCanvas('📊 성과·유저 분석', performanceCanvas);
        if (result.success) {
          canvasIds.performance = result.canvasId;
          console.log('✅ 성과 Canvas 생성됨');
        }
      }

      // 브리핑 Canvas
      if (!canvasIds.briefing) {
        const result = await slackNotifier.createCanvas('📌 DK 모닝 브리핑', briefingCanvas);
        if (result.success) {
          canvasIds.briefing = result.canvasId;
          console.log('✅ 브리핑 Canvas 생성됨');
        }
      }

      // 요약 메시지
      const summary = {
        campaigns: adsData.campaigns.length,
        activeCampaigns: adsData.campaigns.filter((c) => c.status === '진행중').length,
        content: contentData.calendar.length,
        performance: performanceData.latest?.reportName || 'N/A',
        connections: mapping.totalConnections,
      };

      await slackNotifier.postMessage(
        '🎉 마케팅 대시보드가 업데이트되었습니다!',
        [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*📢 광고 운영*\n캠페인: ${summary.activeCampaigns}/${summary.campaigns}개 진행중\n\n*✍️ 콘텐츠*\n발행: ${summary.content}개\n\n*📊 성과*\n${summary.performance}\n\n*🔗 광고-콘텐츠 연동*\n${summary.connections}개 연결`,
            },
          },
        ]
      );
      console.log('✅ 요약 메시지 발송\n');
    } else {
      console.log('📝 [DRY-RUN] Canvas 4개를 Slack에 발송할 예정\n');
    }

    console.log('🎉 모든 동기화 완료!');
    process.exit(0);
  } catch (error) {
    console.error('❌ 오류 발생:', error.message);
    if (config.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
