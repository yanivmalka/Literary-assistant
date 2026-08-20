const fs = require('fs');
const marked = require('marked');

// Read markdown file
const markdown = fs.readFileSync('CONTROLLED_TEST_DOCUMENT.md', 'utf8');

// Convert to HTML
const html = marked(markdown);

// Create HTML document with styling
const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CONTROLLED_TEST_DOCUMENT</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            padding: 40px;
            max-width: 900px;
            margin: 0 auto;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            color: #2c3e50;
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
        }
        h1 { font-size: 2em; border-bottom: 2px solid #eee; padding-bottom: 10px; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 8px; }
        h3 { font-size: 1.25em; }
        p { margin-bottom: 16px; }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 0.9em;
        }
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            border-left: 4px solid #3498db;
        }
        pre code {
            background: transparent;
            padding: 0;
        }
        ul, ol {
            margin-bottom: 16px;
            padding-left: 30px;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 16px;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background: #f8f9fa;
            font-weight: 600;
        }
        tr:nth-child(even) {
            background: #f8f9fa;
        }
        hr {
            border: none;
            border-top: 2px solid #eee;
            margin: 24px 0;
        }
        .highlight {
            background: #fff3cd;
            padding: 2px 6px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
${html}
</body>
</html>`;

// Write HTML file
fs.writeFileSync('CONTROLLED_TEST_DOCUMENT.html', fullHtml);

console.log('HTML file created: CONTROLLED_TEST_DOCUMENT.html');
console.log('Please open this file in a browser and print to PDF.');
