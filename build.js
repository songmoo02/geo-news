const fs=require('fs');
const css=fs.readFileSync('src/app.css','utf8'),body=fs.readFileSync('src/body.html','utf8'),js=fs.readFileSync('src/app.js','utf8');
const geo=fs.readFileSync('geo.json','utf8'), news=fs.readFileSync('news.json','utf8');
JSON.parse(news);
const html=`<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>서부 및 남부 아시아 지리 뉴스(임송무)</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&family=Noto+Serif+KR:wght@700&display=swap" rel="stylesheet">
<style>${css}</style></head><body>
${body}
<script>window.GEO=${geo};window.NEWS_FALLBACK=${news};</script>
<script>${js}</script>
</body></html>`;
fs.mkdirSync('dist',{recursive:true});
fs.writeFileSync('dist/index.html',html); fs.copyFileSync('news.json','dist/news.json');
console.log('built',(html.length/1024).toFixed(0)+'KB');
