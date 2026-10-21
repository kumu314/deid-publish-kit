-- Shape of the private export that feeds verify-durations.js.
-- The fixture only needs { seq, at }; actor/kind/summary make the rows readable when you
-- are checking whether you paired the right two rows, which is the easy mistake to make.
--
-- Do not trust column names from memory. Print them first:
--   pragma table_info(timeline);
-- A guess costs one crash and, worse, a silently wrong pairing when the guess happens to
-- resolve to a different table's column.
--
-- sqlite3 <你的日志库文件> "select seq,at,actor,kind,substr(summary,1,200) s from timeline order by seq;"
-- （库文件名本身可能就是可反查信息——示例里不写真名。）

SELECT seq,
       at,
       actor,
       kind,
       substr(summary, 1, 200) AS summary
FROM timeline
ORDER BY seq;

-- Convert to the fixture shape (rows.json) any way you like; this is the whole contract:
--   { "anchor": "<ISO of the first row>",
--     "rows":   [ { "seq": 240, "at": "<ISO with Z>", ... }, ... ],
--     "claims": [ { "label": "A 首次读数 -> 更正", "seqs": [240, 512], "published": "1.04d" } ],
--     "day_claims": [ { "label": "末行是第几天", "seq": 2048, "published": "71" } ] }
--
-- "published" is the string that appears in the draft, not a number: the check compares
-- text, because the draft's wording ("1h0m" vs "60m") is part of what is being verified.
