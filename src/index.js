export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/feed' || url.pathname === '/') {
      const feed = await env.POSTED_ARTICLES.get('rss_cache');
      return new Response(feed || "Feed empty. Visit /trigger", { 
        headers: { 
          "Content-Type": "application/xml; charset=utf-8",
          "Access-Control-Allow-Origin": "*" 
        } 
      });
    }

    if (url.pathname === '/trigger') {
      try {
        const response = await fetch("https://www.pokebeach.com/", {
          headers: { 
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
          }
        });
        
        const html = await response.text();
        const articles = [];
        const articleRegex = /<article[^>]*>([\s\S]*?)<\/article>/g;
        let articleMatch;

        while ((articleMatch = articleRegex.exec(html)) !== null) {
          const content = articleMatch[1];
          const ltMatch = /entry-title[^>]*>\s*<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/.exec(content);
          const imgMatch = /src="([^"]+)"[^>]*class="[^"]*wp-post-image[^"]*"/.exec(content);
          const summaryMatch = /<div class="entry-summary">([\s\S]*?)<\/div>/.exec(content);

          if (ltMatch) {
            articles.push({
              link: ltMatch[1],
              title: ltMatch[2].replace(/<[^>]+>/g, '').replace(/&#8217;/g, "'").replace(/&amp;/g, "&").trim(),
              image: imgMatch ? imgMatch[1] : "",
              summary: summaryMatch ? summaryMatch[1].replace(/<[^>]+>/g, '').replace(/<a[^>]*>.*?<\/a>/g, '').trim() : ""
            });
          }
        }

        const items = articles.map(a => `
    <item>
      <title><![CDATA[${a.title}]]></title>
      <link>${a.link}</link>
      <guid isPermaLink="false">${a.link}?v=2</guid>
      <description><![CDATA[${a.summary}]]></description>
      <content:encoded><![CDATA[<img src="${a.image}" />]]></content:encoded>
      <pubDate>${new Date().toUTCString()}</pubDate>
      ${a.image ? `<media:content url="${a.image}" medium="image" type="image/jpeg" />` : ''}
      ${a.image ? `<media:thumbnail url="${a.image}" />` : ''}
      ${a.image ? `<enclosure url="${a.image}" length="0" type="image/jpeg" />` : ''}
    </item>`).join('');

        const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" 
     xmlns:media="http://search.yahoo.com/mrss/" 
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>PokéBeach News</title>
    <link>https://www.pokebeach.com</link>
    <description>Latest Pokémon TCG news</description>
    ${items}
  </channel>
</rss>`;
        
        await env.POSTED_ARTICLES.put('rss_cache', rss);
        return new Response(`SUCCESS! Captured ${articles.length} articles. GUIDs rotated for Zapier.`);
      } catch (e) {
        return new Response("Error: " + e.message);
      }
    }
    return new Response("Not Found", { status: 404 });
  }
};
