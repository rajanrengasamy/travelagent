// Simple test to verify YouTube API key works
// Run with: node test-youtube-api.mjs

import { readFileSync } from 'fs';

// Parse .env manually (no dependencies needed)
const envFile = readFileSync('.env', 'utf-8');
const API_KEY = envFile
  .split('\n')
  .find(line => line.startsWith('YOUTUBE_API_KEY='))
  ?.split('=')[1]
  ?.trim()
  ?.replace(/^["']|["']$/g, '');

if (!API_KEY) {
  console.error('❌ YOUTUBE_API_KEY not found in .env');
  process.exit(1);
}

console.log('🔑 API key found, testing YouTube Data API v3...\n');

const query = 'Tokyo travel vlog 2025';
const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=3&key=${API_KEY}`;

try {
  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    console.error('❌ API Error:', data.error.message);
    console.error('   Code:', data.error.code);
    process.exit(1);
  }

  console.log(`✅ YouTube API working!\n`);
  console.log(`Search: "${query}"`);
  console.log(`Results: ${data.items?.length || 0} videos found\n`);

  if (data.items?.length > 0) {
    console.log('Top results:');
    data.items.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.snippet.title}`);
      console.log(`     Channel: ${item.snippet.channelTitle}`);
      console.log(`     Video ID: ${item.id.videoId}\n`);
    });
  }

  console.log('─'.repeat(50));
  console.log('Quota used: ~100 units (search.list)');
  console.log('Daily quota: 10,000 units');

} catch (err) {
  console.error('❌ Network error:', err.message);
  process.exit(1);
}
