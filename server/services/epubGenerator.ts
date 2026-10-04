import JSZip from 'jszip';
import { Chapter, TranslationJob } from '../types.js';

function escapeXml(unsafe: string): string {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatChapterHtml(title: string, content: string, index: number): string {
  const safeTitle = escapeXml(title || `Chapter ${index}`);
  
  // Format paragraphs into clean XHTML <p> tags
  const rawParagraphs = content.split(/\n+/).map(p => p.trim()).filter(Boolean);
  const paragraphElements = rawParagraphs
    .map(p => `  <p class="chapter-para">${escapeXml(p)}</p>`)
    .join('\n');

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body class="chapter-body">
  <h1 class="chapter-title">${safeTitle}</h1>
  <div class="chapter-content">
${paragraphElements}
  </div>
</body>
</html>`;
}

export async function generateEpubBuffer(
  job: TranslationJob,
  options: { onlyCompleted?: boolean } = { onlyCompleted: true }
): Promise<Buffer> {
  const zip = new JSZip();

  // 1. mimetype: MUST be stored uncompressed as the first entry
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.folder('META-INF')!.file('container.xml', containerXml);

  // 3. Filter and strictly sort chapters by chapter.index
  let chaptersToInclude = job.chapters;
  if (options.onlyCompleted) {
    chaptersToInclude = job.chapters.filter(
      c => c.status === 'completed' || c.status === 'fallback_google'
    );
  }

  // Strict ascending numerical sort to ensure chapter order is NEVER jumbled
  chaptersToInclude = [...chaptersToInclude].sort((a, b) => a.index - b.index);

  const oebps = zip.folder('OEBPS')!;

  // 4. CSS
  const css = `
@charset "utf-8";
body {
  margin: 5% 6%;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.1em;
  line-height: 1.7;
  color: #1a1a1a;
  background-color: #fdfdfd;
}
h1.chapter-title {
  font-size: 1.8em;
  font-weight: bold;
  text-align: center;
  margin-top: 1.5em;
  margin-bottom: 1.5em;
  padding-bottom: 0.5em;
  border-bottom: 1px solid #e0e0e0;
  line-height: 1.3;
}
p.chapter-para {
  text-indent: 1.8em;
  margin-top: 0;
  margin-bottom: 0.6em;
  text-align: justify;
}
.title-page {
  text-align: center;
  padding-top: 25%;
}
.book-title {
  font-size: 2.2em;
  font-weight: bold;
  margin-bottom: 0.4em;
}
.book-meta {
  color: #666;
  font-size: 0.95em;
}
`;
  oebps.file('style.css', css);

  // Title page
  const safeBookTitle = escapeXml(job.title || 'Translated Novel');
  const titlePageHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${safeBookTitle}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <div class="title-page">
    <h1 class="book-title">${safeBookTitle}</h1>
    <p class="book-meta">Translated with MegaTXT Lite</p>
    <p class="book-meta">Target: ${escapeXml(job.targetLang)} | Chapters: ${chaptersToInclude.length}</p>
    <p class="book-meta">Generated: ${new Date().toLocaleDateString()}</p>
  </div>
</body>
</html>`;
  oebps.file('titlepage.xhtml', titlePageHtml);

  // Manifest items & spine items
  const manifestItems: string[] = [
    `<item id="style" href="style.css" media-type="text/css"/>`,
    `<item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>`,
    `<item id="toc" href="toc.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
  ];

  const spineItems: string[] = [
    `<itemref idref="titlepage"/>`,
    `<itemref idref="toc"/>`,
  ];

  const tocNavPoints: string[] = [];
  const tocListItems: string[] = [];

  // Write chapter XHTML files
  chaptersToInclude.forEach((ch, idx) => {
    const fileId = `chapter_${String(ch.index).padStart(4, '0')}`;
    const fileName = `${fileId}.xhtml`;
    const chapterText = ch.translatedText || ch.originalText || '';
    const chapterTitle = ch.title || `Chapter ${ch.index}`;

    const xhtmlContent = formatChapterHtml(chapterTitle, chapterText, ch.index);
    oebps.file(fileName, xhtmlContent);

    manifestItems.push(`<item id="${fileId}" href="${fileName}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${fileId}"/>`);

    const safeTitle = escapeXml(chapterTitle);
    tocNavPoints.push(`
    <navPoint id="navPoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel><text>${safeTitle}</text></navLabel>
      <content src="${fileName}"/>
    </navPoint>`);

    tocListItems.push(`    <li><a href="${fileName}">${safeTitle}</a></li>`);
  });

  // Table of Contents XHTML (EPUB3 Nav)
  const tocXhtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Table of Contents</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1 class="chapter-title">Table of Contents</h1>
    <ol style="list-style-type: decimal; line-height: 1.8; padding-left: 1.5em;">
${tocListItems.join('\n')}
    </ol>
  </nav>
</body>
</html>`;
  oebps.file('toc.xhtml', tocXhtml);

  // Table of Contents NCX (EPUB2 compatibility for Kindle / e-readers)
  const tocNcx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${job.id}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${safeBookTitle}</text></docTitle>
  <navMap>
${tocNavPoints.join('')}
  </navMap>
</ncx>`;
  oebps.file('toc.ncx', tocNcx);

  // content.opf
  const contentOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:uuid:${job.id}</dc:identifier>
    <dc:title>${safeBookTitle}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>MegaTXT Lite Translator</dc:creator>
    <dc:date>${new Date().toISOString()}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
${manifestItems.map(item => '    ' + item).join('\n')}
  </manifest>
  <spine toc="ncx">
${spineItems.map(item => '    ' + item).join('\n')}
  </spine>
</package>`;
  oebps.file('content.opf', contentOpf);

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return buffer;
}
