export async function blockToMarkdown(block, getChildrenFn) {
  const { type } = block;

  switch (type) {
    case 'paragraph':
      return richTextToMarkdown(block.paragraph.rich_text) + '\n';

    case 'heading_1':
      return '# ' + richTextToMarkdown(block.heading_1.rich_text) + '\n';

    case 'heading_2':
      return '## ' + richTextToMarkdown(block.heading_2.rich_text) + '\n';

    case 'heading_3':
      return '### ' + richTextToMarkdown(block.heading_3.rich_text) + '\n';

    case 'bulleted_list_item':
      return '- ' + richTextToMarkdown(block.bulleted_list_item.rich_text) + '\n';

    case 'numbered_list_item':
      return '1. ' + richTextToMarkdown(block.numbered_list_item.rich_text) + '\n';

    case 'to_do':
      const checked = block.to_do.checked ? '[x]' : '[ ]';
      return `${checked} ${richTextToMarkdown(block.to_do.rich_text)}\n`;

    case 'toggle':
      const toggleText = richTextToMarkdown(block.toggle.rich_text);
      const children = await getChildrenFn(block.id);
      const childrenMd = children.length > 0 ? '\n' + (await blockListToMarkdown(children, getChildrenFn)) : '';
      return `<details>\n<summary>${toggleText}</summary>\n${childrenMd}</details>\n`;

    case 'quote':
      return '> ' + richTextToMarkdown(block.quote.rich_text) + '\n';

    case 'callout':
      const calloutText = richTextToMarkdown(block.callout.rich_text);
      const icon = block.callout.icon?.emoji || '💡';
      return `${icon} **Callout:** ${calloutText}\n`;

    case 'code':
      const language = block.code.language || 'text';
      const codeText = richTextToMarkdown(block.code.rich_text);
      return `\`\`\`${language}\n${codeText}\n\`\`\`\n`;

    case 'divider':
      return '---\n';

    case 'table':
      // Simplified table representation
      return '<!-- TABLE: Use table block in Notion for structured data -->\n';

    case 'table_of_contents':
      return '<!-- TABLE OF CONTENTS -->\n';

    case 'image':
      if (block.image.type === 'external') {
        return `![image](${block.image.external.url})\n`;
      }
      // file type images should be handled by asset downloader
      return '![image](image)\n';

    case 'file':
      if (block.file.type === 'external') {
        return `[File](${block.file.external.url})\n`;
      }
      return '[File](file)\n';

    case 'pdf':
      if (block.pdf.type === 'external') {
        return `[PDF](${block.pdf.external.url})\n`;
      }
      return '[PDF](pdf)\n';

    case 'video':
      if (block.video.type === 'external') {
        return `[Video](${block.video.external.url})\n`;
      }
      return '[Video](video)\n';

    case 'audio':
      return '🎵 Audio file\n';

    case 'bookmark':
      const url = block.bookmark.url;
      return `[Bookmark: ${url}](${url})\n`;

    case 'embed':
      return `[Embed: ${block.embed.url}](${block.embed.url})\n`;

    case 'link_preview':
      return `[Link: ${block.link_preview.url}](${block.link_preview.url})\n`;

    case 'synced_block':
      // Synced blocks reference another block, skip rendering here
      return '<!-- Synced block -->\n';

    case 'child_page':
    case 'child_database':
      // These are structural elements, handled separately by the crawler
      return '';

    case 'unsupported':
      return '<!-- Unsupported block type -->\n';

    default:
      return `<!-- Unsupported block type: ${type} -->\n`;
  }
}

export async function blockListToMarkdown(blocks, getChildrenFn) {
  const lines = [];
  for (const block of blocks) {
    const md = await blockToMarkdown(block, getChildrenFn);
    if (md) lines.push(md);
  }
  return lines.join('');
}

export function richTextToMarkdown(richTexts) {
  return richTexts
    .map((text) => {
      let content = text.plain_text;

      if (text.annotations) {
        const { bold, italic, strikethrough, underline, code } = text.annotations;
        if (code) content = `\`${content}\``;
        if (bold) content = `**${content}**`;
        if (italic) content = `*${content}*`;
        if (strikethrough) content = `~~${content}~~`;
        if (underline) content = `<u>${content}</u>`;
      }

      if (text.href) {
        content = `[${content}](${text.href})`;
      }

      return content;
    })
    .join('');
}
