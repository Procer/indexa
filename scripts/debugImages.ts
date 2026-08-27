const GRAPHQL = "https://www.fravega.com/api/v2/graphql";
const QUERY = `
  query FetchItems($keywords: String!, $from: Int!) {
    items(filters: { keywords: $keywords } pagination: { size: 2, from: $from } sorting: RELEVANCE) {
      results { code images item { title } }
    }
  }
`;

async function main() {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://www.fravega.com/",
    },
    body: JSON.stringify({ query: QUERY, variables: { keywords: "notebook", from: 0 } }),
  });
  const data = await res.json() as { data: { items: { results: { code: string; images: unknown; item: { title: string } }[] } } };
  const result = data.data.items.results[0];
  console.log("title:", result.item.title);
  console.log("images raw:", JSON.stringify(result.images, null, 2));
}

main();
