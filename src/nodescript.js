const API_KEY =
  "sk_prod_07b88ff7-fd3f-4271-bec9-beaeccffded0_pmS7rMiHMccwvAZE2jDwqIYl3jYjDF8ps6U70KCH94HVYmmzyvU7818shEU0gn3w"; // Get key from https://platform.learningcommons.org
const BASE_URL = "https://api.learningcommons.org/knowledge-graph/v0";

const headers = {
  "x-api-key":
    "sk_prod_07b88ff7-fd3f-4271-bec9-beaeccffded0_pmS7rMiHMccwvAZE2jDwqIYl3jYjDF8ps6U70KCH94HVYmmzyvU7818shEU0gn3w",
  Accept: "application/json",
};

// 1. Fetch frameworks using required query params
async function getFrameworks() {
  const url = new URL(`${BASE_URL}/standards-frameworks`);
  url.search = new URLSearchParams({
    academicSubject: "Mathematics",
    jurisdiction: "Multi-State",
  });

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

// 2. Fetch one page of standards given a framework ID (+ optional cursor)
async function getStandardsPage(frameworkId, cursor) {
  const url = new URL(`${BASE_URL}/academic-standards`);
  const params = { standardsFrameworkCaseIdentifierUUID: frameworkId, limit: "100" };
  if (cursor) params.cursor = cursor;
  url.search = new URLSearchParams(params);

  const response = await fetch(url, { method: "GET", headers });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return response.json();
}

// Paginates through ALL standards for a framework, following nextCursor
// until hasMore is false.
async function getAllStandards(frameworkId) {
  let all = [];
  let cursor = null;
  let page = 1;

  while (true) {
    const result = await getStandardsPage(frameworkId, cursor);
    const pageData = result.data || [];
    all = all.concat(pageData);
    console.log(`  Standards page ${page}: +${pageData.length} (total ${all.length})`);

    if (!result.pagination?.hasMore) break;
    cursor = result.pagination.nextCursor;
    page++;
  }

  return all;
}

// Main execution block
(async () => {
  try {
    console.log("Fetching frameworks...");
    const frameworksResult = await getFrameworks();
    const frameworks = frameworksResult.data || [];
    console.log(`Found ${frameworks.length} framework(s).`);

    const allStandardsByFramework = {};

    for (const framework of frameworks) {
      const frameworkId = framework.caseIdentifierUUID;
      if (!frameworkId) continue;

      console.log(`\nFetching all standards for "${framework.name}" (${frameworkId})...`);
      const standards = await getAllStandards(frameworkId);
      allStandardsByFramework[frameworkId] = {
        framework,
        standards,
      };
      console.log(`  Done: ${standards.length} standard(s) for this framework.`);
    }

    const fs = await import("fs");
    fs.writeFileSync(
      "all_data.json",
      JSON.stringify({ frameworks, standardsByFramework: allStandardsByFramework }, null, 2),
    );
    const totalStandards = Object.values(allStandardsByFramework).reduce(
      (sum, entry) => sum + entry.standards.length,
      0,
    );
    console.log(
      `\nDONE. ${frameworks.length} framework(s), ${totalStandards} total standard(s) saved to all_data.json`,
    );
  } catch (error) {
    console.error("Execution failed:", error.message);
  }
})();
