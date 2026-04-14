
function getRankFromCode(ma_khoa, currentRank) {
  // If rank is valid (not bold/bold2/null), just return it
  if (currentRank && !/bold/i.test(currentRank)) {
    return currentRank.toUpperCase();
  }

  if (!ma_khoa) return currentRank;

  // Fallback logic based on user rules:
  // K25B008 -> B
  // K26B0103 -> B1
  // K27Cxxx -> C1
  const code = ma_khoa.toUpperCase();
  if (code.includes("B01")) return "B1";
  if (code.includes("B02")) return "B2";
  if (/K\d+B/i.test(code)) return "B";
  if (/K\d+C/i.test(code)) return "C1";

  return currentRank;
}

const testCases = [
  { ma: "K25B008", rank: "bold", expected: "B" },
  { ma: "K26B0103", rank: "bold2", expected: "B1" },
  { ma: "K27C30004", rank: null, expected: "C1" },
  { ma: "K24B02-01", rank: "bold", expected: "B2" },
  { ma: "K23D001", rank: "D", expected: "D" }, // Should keep existing valid rank
];

console.log("--- Testing Rank Detection ---");
testCases.forEach(t => {
  const result = getRankFromCode(t.ma, t.rank);
  console.log(`Input: ma=${t.ma}, rank=${t.rank} | Result: ${result} | Expected: ${t.expected} | ${result === t.expected ? 'PASS' : 'FAIL'}`);
});
