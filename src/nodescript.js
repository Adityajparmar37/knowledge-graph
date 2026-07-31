// USAGE: node fetch_all.js
const BASE = "https://satchelcommons.com/ims/case/v1p0/CFDocuments"; // change if diff endpoint
const API_KEY =
  "sk_prod_07b88ff7-fd3f-4271-bec9-beaeccffded0_pmS7rMiHMccwvAZE2jDwqIYl3jYjDF8ps6U70KCH94HVYmmzyvU7818shEU0gn3w";

async function fetchAll() {
  let cursor = null;
  let all = [];
  let page = 1;

  while (true) {
    const url = new URL(BASE);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });

    if (!res.ok) {
      console.error(`Failed page ${page}: ${res.status}`);
      break;
    }

    const json = await res.json();
    all = all.concat(json.data);
    console.log(`Page ${page}: +${json.data.length} (total ${all.length})`);

    if (!json.pagination?.hasMore) break;
    cursor = json.pagination.nextCursor;
    page++;
  }

  require("fs").writeFileSync("all_data.json", JSON.stringify(all, null, 2));
  console.log(`DONE. ${all.length} records saved to all_data.json`);
}

fetchAll();
