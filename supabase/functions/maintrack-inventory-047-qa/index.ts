// supabase/functions/maintrack-inventory-047-qa/entry.mjs
import pg from "npm:pg@8.13.3";
import { Buffer as Buffer2 } from "node:buffer";

// ops/maintrack/inventory/backend/src/maintrack-session-adapter.mjs
import { createHash } from "node:crypto";
function createMainTrackOpaqueSessionVerifier({ pool: pool2 } = {}) {
  if (!pool2 || typeof pool2.query !== "function") throw Error("PRIVATE_POSTGRES_POOL_REQUIRED");
  return async function verifySession(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
    const hash = createHash("sha256").update(token.toLowerCase()).digest("hex");
    const result = await pool2.query(
      'SELECT u.id::text AS "userId",u.role::text AS role,u.active,u.must_change AS "mustChange" FROM public.mt_sessions s INNER JOIN public.mt_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND s.token_version=u.token_version AND u.active=true LIMIT 1',
      [hash]
    );
    const user = result.rows[0];
    if (!user || user.active !== true || user.mustChange === true) return null;
    if (!["owner", "engineer", "technician"].includes(user.role)) return null;
    return { authenticated: true, active: true, role: user.role, userId: user.userId };
  };
}

// ops/maintrack/inventory/backend/src/import-xlsx.mjs
import ExcelJS from "exceljs";
import yauzl from "yauzl";
import { createHash as createHash2 } from "node:crypto";

// ops/maintrack/inventory/backend/src/domain.mjs
var text = (v) => String(v ?? "").trim();
var normalizeCode = (v) => text(v).toUpperCase();
var normalizeDescription = (v) => text(v).replace(/\s+/g, " ");
function validateAndNormalizeRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("EMPTY_SNAPSHOT");
  const codes = /* @__PURE__ */ new Set(), items = [];
  for (let i = 0; i < rows.length; i++) {
    const src = rows[i] || {}, code2 = normalizeCode(src.code);
    const description = normalizeDescription(src.description);
    const quantity = src.quantity === null || src.quantity === void 0 || src.quantity === "" ? null : Number(src.quantity);
    if (!code2) throw new Error("INVALID_REQUIRED_FIELD:" + String(i + 1));
    if (codes.has(code2)) throw new Error("DUPLICATE_CODE:" + code2);
    if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) throw new Error("INVALID_QUANTITY:" + code2);
    if (quantity !== null && !Number.isSafeInteger(Math.round(quantity * 1e4)))
      throw new Error("QUANTITY_OVERFLOW:" + code2);
    const location = src.location === null || src.location === void 0 ? null : text(src.location);
    codes.add(code2);
    items.push({ code: code2, description, quantity, location });
  }
  return items;
}
function authorizeInventoryAction(identity, action) {
  if (!identity || identity.authenticated !== true || identity.active !== true) throw new Error("UNAUTHENTICATED");
  const role = text(identity.role).toLowerCase();
  if (!["owner", "engineer", "technician"].includes(role)) throw new Error("FORBIDDEN");
  if (!["search", "details", "versions:list", "upload", "diff", "publish", "restore", "audit"].includes(action))
    throw new Error("UNKNOWN_ACTION");
  if (!["search", "details"].includes(action) && role !== "owner") throw new Error("FORBIDDEN");
  return { role, userId: identity.userId };
}

// ops/maintrack/inventory/backend/src/import-xlsx.mjs
var MAX_FILE = 10 * 1024 * 1024;
var MAX_UNZIPPED = 48 * 1024 * 1024;
var MAX_ENTRIES = 180;
var MAX_ITEMS = 3e4;
var clean = (x) => String(x ?? "").normalize("NFKC").trim();
var code = (x) => clean(x).toUpperCase();
var key = (x) => clean(x).toLowerCase().replace(/[\s_-]+/g, "");
function safeCell(c) {
  const v = c.value;
  if (v === null || v === void 0) return "";
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) {
      if (v.result === null || v.result === void 0) throw new Error("FORMULA_WITHOUT_CACHED_RESULT");
      return v.result;
    }
    if ("richText" in v) return v.richText.map((x) => x.text).join("");
    if ("text" in v && "hyperlink" in v) throw new Error("HYPERLINK_NOT_ALLOWED");
    throw new Error("COMPLEX_CELL_NOT_ALLOWED");
  }
  if (v instanceof Date || typeof v === "boolean") throw new Error("UNSUPPORTED_CELL_TYPE");
  return v;
}
function qty(value, line) {
  if (value === null || value === void 0 || clean(value) === "") throw new Error("MISSING_QUANTITY_ROW_" + line);
  const n = Number(clean(value).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(Math.round(n * 1e4)) || Math.abs(n * 1e4 - Math.round(n * 1e4)) > 1e-7) throw new Error("INVALID_QUANTITY_ROW_" + line);
  return n;
}
function zipPreflight(bytes) {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, autoClose: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(new Error("INVALID_XLSX_ZIP"));
      let entries = 0, total = 0, closed = false;
      const fail = (e) => {
        if (closed) return;
        closed = true;
        zip.close();
        reject(new Error(e));
      };
      zip.on("error", () => fail("INVALID_XLSX_ZIP"));
      zip.on("entry", (entry) => {
        if (closed) return;
        entries++;
        total += entry.uncompressedSize;
        if (entries > MAX_ENTRIES || total > MAX_UNZIPPED) return fail("XLSX_UNPACK_LIMIT");
        if (entry.uncompressedSize > 8 * 1024 * 1024) return fail("XLSX_ENTRY_LIMIT");
        if (entry.uncompressedSize > entry.compressedSize * 250 && entry.uncompressedSize > 32768) return fail("XLSX_COMPRESSION_RATIO");
        const name = entry.fileName;
        if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..") || /(?:^|\/)(?:vbaProject\.bin|externalLinks|embeddings)(?:\/|$)/i.test(name))
          return fail("XLSX_UNSAFE_ENTRY");
        zip.readEntry();
      });
      zip.on("end", () => {
        if (!closed) {
          closed = true;
          resolve();
        }
      });
      zip.readEntry();
    });
  });
}
async function parseInventoryXlsx(input, { filename = "inventory.xlsx", minItems = 100 } = {}) {
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) throw new Error("FILE_BYTES_REQUIRED");
  const buffer = Buffer.from(input);
  if (!/^[^\\/]{1,240}\.xlsx$/i.test(filename)) throw new Error("ONLY_XLSX_ALLOWED");
  if (buffer.length < 100 || buffer.length > MAX_FILE) throw new Error("INVALID_FILE_SIZE");
  await zipPreflight(buffer);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new Error("INVALID_XLSX_CONTENT");
  }
  let parts, locations;
  for (const sheet of wb.worksheets) {
    if (sheet.rowCount > MAX_ITEMS + 10) throw new Error("XLSX_TOO_MANY_ROWS");
    const h = sheet.getRow(1), a = key(safeCell(h.getCell(1))), b = key(safeCell(h.getCell(2))), c = key(safeCell(h.getCell(3))), f = key(safeCell(h.getCell(6)));
    if (a === "itemcode" && b === "itemdesc" && c === "endqty") {
      if (parts) throw new Error("DUPLICATE_PARTS_SHEET");
      parts = sheet;
    }
    if (a.includes("\u0627\u0643\u0648\u0627\u062F\u0627\u0648\u0631\u0643\u0644") && f === "location") {
      if (locations) throw new Error("DUPLICATE_LOCATION_SHEET");
      locations = sheet;
    }
  }
  if (!parts || !locations) throw new Error("REQUIRED_SHEETS_MISSING");
  const locationMap = /* @__PURE__ */ new Map(), items = /* @__PURE__ */ new Map();
  locations.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const k = code(safeCell(r.getCell(1)));
    if (!k) return;
    if (locationMap.has(k)) throw new Error("DUPLICATE_LOCATION_CODE:" + k);
    locationMap.set(k, {
      description: clean(safeCell(r.getCell(3))),
      location: clean(safeCell(r.getCell(6))),
      extra: {
        iccCode: clean(safeCell(r.getCell(2))),
        oldCard: clean(safeCell(r.getCell(4))),
        newCard: clean(safeCell(r.getCell(7))),
        drawer: clean(safeCell(r.getCell(8))),
        sourceSheet: "locations"
      }
    });
  });
  parts.eachRow({ includeEmpty: false }, (r, n) => {
    if (n === 1) return;
    const k = code(safeCell(r.getCell(1)));
    if (!k) return;
    if (items.has(k)) throw new Error("DUPLICATE_PART_CODE:" + k);
    const loc = locationMap.get(k);
    items.set(k, {
      code: k,
      description: clean(safeCell(r.getCell(2))),
      quantity: qty(safeCell(r.getCell(3)), n),
      location: loc?.location || "",
      extra: { ...loc?.extra || {}, sourceSheet: "parts" }
    });
  });
  for (const [k, loc] of locationMap) if (!items.has(k)) {
    items.set(k, { code: k, description: loc.description, quantity: null, location: loc.location, extra: loc.extra });
  }
  if (items.size < minItems || items.size > MAX_ITEMS) throw new Error("SUSPICIOUS_ITEM_COUNT:" + items.size);
  const canonical = validateAndNormalizeRows([...items.values()]);
  const metadata = new Map([...items.values()].map((x) => [x.code, x.extra]));
  for (const item of canonical) item.extra = metadata.get(item.code);
  return {
    filename,
    fileSha256: createHash2("sha256").update(buffer).digest("hex"),
    items: canonical,
    total: canonical.length,
    sourceSheets: { parts: parts.name, locations: locations.name }
  };
}

// ops/maintrack/inventory/backend/src/private-bucket.mjs
import { createHash as createHash3 } from "node:crypto";
var safeKey = (key3) => typeof key3 === "string" && /^inventory\/imports\/[0-9a-f-]{36}\.xlsx$/.test(key3);
var bufferOf = (v) => Buffer.isBuffer(v) ? v : Buffer.from(v);
async function createPrivateBucketArchive({ storage: storage2, bucket: bucket2 } = {}) {
  if (!storage2?.getBucket || !storage2?.from || typeof bucket2 !== "string" || !/^[-a-z0-9_]{3,60}$/.test(bucket2))
    throw Error("STORAGE_CLIENT_AND_BUCKET_REQUIRED");
  const status = await storage2.getBucket(bucket2);
  if (status.error || !status.data || status.data.public !== false)
    throw Error("PUBLIC_OR_UNAVAILABLE_BUCKET_DENIED");
  const privateBucket = storage2.from(bucket2);
  if (!privateBucket?.upload || !privateBucket?.remove || !privateBucket?.download)
    throw Error("PRIVATE_BUCKET_OPERATIONS_REQUIRED");
  return Object.freeze({
    async putObject({ key: key3, bytes, sha256 }) {
      if (!safeKey(key3) || !/^[a-f0-9]{64}$/.test(sha256 || "")) throw Error("INVALID_PRIVATE_OBJECT_KEY");
      const data = bufferOf(bytes);
      if (createHash3("sha256").update(data).digest("hex") !== sha256) throw Error("UPLOAD_SHA_MISMATCH");
      const response2 = await privateBucket.upload(key3, data, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", cacheControl: "0", upsert: false });
      if (response2.error) throw Error("PRIVATE_UPLOAD_FAILED");
    },
    async getObject({ key: key3 }) {
      if (!safeKey(key3)) throw Error("INVALID_PRIVATE_OBJECT_KEY");
      const response2 = await privateBucket.download(key3);
      if (response2.error || !response2.data) throw Error("PRIVATE_OBJECT_NOT_FOUND");
      return Buffer.from(await response2.data.arrayBuffer());
    },
    async deleteObject({ key: key3 }) {
      if (!safeKey(key3)) throw Error("INVALID_PRIVATE_OBJECT_KEY");
      const response2 = await privateBucket.remove([key3]);
      if (response2.error) throw Error("PRIVATE_REMOVE_FAILED");
    }
  });
}

// ops/maintrack/inventory/backend/src/postgres-store.mjs
import { randomUUID } from "node:crypto";

// ops/maintrack/inventory/backend/src/search-normalizer.mjs
var arabicDigit = (c) => {
  const eastern = "\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669", persian = "\u06F0\u06F1\u06F2\u06F3\u06F4\u06F5\u06F6\u06F7\u06F8\u06F9";
  const e = eastern.indexOf(c), p = persian.indexOf(c);
  return e >= 0 ? String(e) : p >= 0 ? String(p) : c;
};
var synonyms = /* @__PURE__ */ new Map([
  ["\u0628\u0627\u0631\u0643\u0631", "parker"],
  ["\u0628\u0627\u0631\u0643\u064A\u0631", "parker"],
  ["\u0627\u0646\u0641\u0631\u062A\u0631", "inverter"],
  ["\u0627\u0646\u0641\u0631\u062A\u064A\u0631", "inverter"],
  ["\u0627\u0646\u0641\u064A\u0631\u062A\u0631", "inverter"],
  ["vfd", "inverter"],
  ["inverters", "inverter"]
]);
function inventoryTerms(input, { maxLength = 120 } = {}) {
  if (typeof input !== "string" || input.length > maxLength) throw Error("INVALID_QUERY");
  let s = input.normalize("NFKC").toLowerCase().replace(/[٠-٩۰-۹]/g, arabicDigit).replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[إأآٱ]/g, "\u0627").replace(/ى/g, "\u064A");
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:امبير|amperes?|amps?|a)(?=$|[^\p{L}\p{N}])/gu, (_, n) => " " + n + "amp ");
  s = s.replace(/(\d+(?:\.\d+)?)\s*(?:litres?|liters?|l)(?=$|[^\p{L}\p{N}])/gu, (_, n) => " " + n + "l ");
  s = s.replace(/(^|[^\p{L}\p{N}])m[\s-]+(\d+)(?=$|[^\p{L}\p{N}])/gu, (_, prefix, n) => prefix + "m" + n);
  const terms = s.replace(/[^\p{L}\p{N}.]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  return terms.map((x) => synonyms.get(x) || x);
}
function matchesInventoryItem(item, query) {
  if (!item || typeof item !== "object") return false;
  const terms = Array.isArray(query) ? query : inventoryTerms(query);
  if (!terms.length) return false;
  const fields = [
    item.code,
    item.description,
    item.location,
    item.extra?.iccCode,
    item.extra?.brand,
    item.extra?.model
  ].filter((x) => typeof x === "string");
  const available = new Set(fields.flatMap((x) => inventoryTerms(x, { maxLength: 1e4 })));
  return terms.every((term) => available.has(term));
}
function filterConfirmedInventoryItems(items, query, { limit = 50 } = {}) {
  if (!Array.isArray(items)) throw Error("CONFIRMED_ITEMS_REQUIRED");
  const terms = inventoryTerms(query);
  if (!terms.length) return [];
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw Error("INVALID_LIMIT");
  const result = [];
  for (const item of items) if (matchesInventoryItem(item, terms)) {
    result.push(item);
    if (result.length === n) break;
  }
  return result;
}

// ops/maintrack/inventory/backend/src/postgres-store.mjs
var PostgresInventoryStore = class {
  constructor({ pool: pool2, privateFiles }) {
    if (!pool2?.connect || !privateFiles?.putObject || !privateFiles?.deleteObject)
      throw Error("PRIVATE_DATABASE_AND_FILE_STORE_REQUIRED");
    this.pool = pool2;
    this.files = privateFiles;
  }
  async transaction(run) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const value = await run(db);
      await db.query("COMMIT");
      return value;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  async current() {
    const r = await this.pool.query('SELECT a.current_version_id::text AS "versionId",a.generation::text AS "generation",v.approved_at AS "approvedAt",v.filename FROM inv_lab.active a LEFT JOIN inv_lab.versions v ON v.id=a.current_version_id WHERE a.singleton=true');
    if (!r.rows.length) throw Error("ACTIVE_POINTER_MISSING");
    return { ...r.rows[0], generation: Number(r.rows[0].generation) };
  }
  async approvedRows() {
    const MAX_APPROVED_ROWS = 3e4;
    const r = await this.pool.query(
      "SELECT i.code,i.description,i.quantity::text AS quantity,i.location,i.extra FROM inv_lab.active a JOIN inv_lab.versions v ON v.id=a.current_version_id JOIN inv_lab.items i ON i.version_id=v.id WHERE a.singleton=true AND v.status='current' AND v.sealed=true ORDER BY i.code LIMIT $1",
      [MAX_APPROVED_ROWS + 1]
    );
    if (r.rows.length > MAX_APPROVED_ROWS) throw Error("INVENTORY_SCAN_TOO_LARGE");
    return r.rows;
  }
  async search(term, limit = 50) {
    if (typeof term !== "string" || !term.trim()) throw Error("INVALID_QUERY");
    inventoryTerms(term);
    const n = limit === void 0 ? 50 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw Error("INVALID_LIMIT");
    return filterConfirmedInventoryItems(await this.approvedRows(), term, { limit: n });
  }
  async searchPage(term, { limit = 50, offset = 0, versionId } = {}) {
    if (typeof term !== "string" || !term.trim()) throw Error("INVALID_QUERY");
    const terms = inventoryTerms(term);
    const n = limit === void 0 ? 50 : Number(limit);
    const start = offset === void 0 ? 0 : Number(offset);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw Error("INVALID_LIMIT");
    if (!Number.isInteger(start) || start < 0 || start > 3e4) throw Error("INVALID_OFFSET");
    const before = await this.current();
    if (versionId !== void 0 && versionId !== before.versionId)
      throw Error("INVENTORY_VERSION_CHANGED_RESTART_SEARCH");
    const rows = await this.approvedRows();
    const after = await this.current();
    if (before.versionId !== after.versionId || before.generation !== after.generation)
      throw Error("INVENTORY_VERSION_CHANGED_RESTART_SEARCH");
    const all = rows.filter((item) => matchesInventoryItem(item, terms));
    const items = all.slice(start, start + n), hasMore = start + items.length < all.length;
    return {
      items,
      totalMatches: all.length,
      offset: start,
      limit: n,
      hasMore,
      nextOffset: hasMore ? start + items.length : null,
      versionId: before.versionId
    };
  }
  async item(code2) {
    const r = await this.pool.query('SELECT i.code,i.description,i.quantity::text AS quantity,i.location,i.extra,i.version_id::text AS "versionId" FROM inv_lab.items i JOIN inv_lab.active a ON a.current_version_id=i.version_id WHERE i.code=$1', [String(code2).normalize("NFKC").trim().toUpperCase()]);
    return r.rows[0] || null;
  }
  async stage({ items, filename, fileSha256, buffer, actor }) {
    const storageKey = "inventory/imports/" + randomUUID() + ".xlsx";
    await this.files.putObject({ key: storageKey, bytes: buffer, sha256: fileSha256 });
    try {
      return await this.transaction(async (db) => {
        const live = await db.query("SELECT current_version_id::text AS id FROM inv_lab.active WHERE singleton=true");
        const baseId = live.rows[0]?.id ?? null;
        const v = await db.query("INSERT INTO inv_lab.versions(parent_version_id,file_sha256,filename,file_storage_key,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id::text AS id", [baseId, fileSha256, filename, storageKey, actor]);
        const draftId = v.rows[0].id;
        for (let index = 0; index < items.length; index += 250) {
          const block = items.slice(index, index + 250), parameters = [];
          const placeholders = block.map((item, position) => {
            parameters.push(draftId, item.code, item.description, item.quantity, item.location, JSON.stringify(item.extra || {}));
            const offset = position * 6;
            return "(" + Array.from({ length: 6 }, (_, k) => "$" + (offset + k + 1)).join(",") + ")";
          });
          await db.query("INSERT INTO inv_lab.items(version_id,code,description,quantity,location,extra) VALUES " + placeholders.join(","), parameters);
        }
        await db.query("INSERT INTO inv_lab.audit(event,version_id,base_version_id,actor) VALUES('STAGED',$1,$2,$3)", [draftId, baseId, actor]);
        await db.query("SELECT inv_lab.seal_version($1,$2)", [draftId, actor]);
        return { draftId, baseVersionId: baseId };
      });
    } catch (e) {
      await this.files.deleteObject({ key: storageKey }).catch(() => {
      });
      throw e;
    }
  }
  async diff(draftId) {
    const r = await this.pool.query('SELECT id::text AS id,parent_version_id::text AS "baseVersionId",file_sha256 AS "fileSha256",status,item_count AS "itemCount",filename FROM inv_lab.versions WHERE id=$1', [draftId]);
    const v = r.rows[0];
    if (!v) throw Error("DRAFT_NOT_FOUND");
    if (v.status !== "pending") throw Error("DRAFT_NOT_PENDING");
    const current = await this.current();
    const changes = await this.pool.query("SELECT * FROM inv_lab.compare_version($1)", [draftId]);
    const details = changes.rows.map((x) => ({
      code: x.code,
      type: x.change_type,
      before: x.old_description === null ? null : { description: x.old_description, quantity: x.old_quantity === null ? null : Number(x.old_quantity), location: x.old_location },
      after: x.new_description === null ? null : { description: x.new_description, quantity: x.new_quantity === null ? null : Number(x.new_quantity), location: x.new_location }
    }));
    const counts = { NEW: 0, CHANGED: 0, ABSENT: 0, UNCHANGED: 0 };
    for (const x of details) counts[x.type]++;
    const baseSize = counts.CHANGED + counts.ABSENT + counts.UNCHANGED;
    return {
      draftId,
      baseVersionId: v.baseVersionId,
      currentVersionId: current.versionId,
      fileSha256: v.fileSha256,
      filename: v.filename,
      total: Number(v.itemCount),
      counts,
      absentRatio: baseSize ? counts.ABSENT / baseSize : 0,
      requiresExplicitReview: baseSize > 0 && counts.ABSENT / baseSize > 0.1,
      details
    };
  }
  async publish(draftId, baseVersionId, actor) {
    try {
      const q = await this.pool.query("SELECT inv_lab.publish_version($1,$2,$3)::text AS id", [draftId, baseVersionId, actor]);
      return { versionId: q.rows[0].id };
    } catch (e) {
      if (e.code === "40001") throw Error("STALE_BASE_RECOMPARE_REQUIRED");
      throw e;
    }
  }
  async history(limit = 100) {
    const q = await this.pool.query(`SELECT id::text,parent_version_id::text AS "parentVersionId",source_version_id::text AS "sourceVersionId",filename,item_count AS "itemCount",status,approved_at AS "approvedAt",archived_at AS "archivedAt" FROM inv_lab.versions WHERE status IN ('current','archived') ORDER BY approved_at DESC LIMIT $1`, [Math.max(1, Math.min(Number(limit) || 100, 500))]);
    return q.rows;
  }
  async stageRestore(sourceId, actor) {
    return this.transaction(async (db) => {
      const a = await db.query("SELECT current_version_id::text AS id FROM inv_lab.active WHERE singleton=true");
      const baseId = a.rows[0]?.id ?? null;
      const s = await db.query("SELECT file_sha256,file_storage_key,status FROM inv_lab.versions WHERE id=$1", [sourceId]);
      if (s.rows[0]?.status !== "archived") throw Error("ONLY_ARCHIVED_VERSION_CAN_BE_RESTORED");
      const src = s.rows[0];
      const v = await db.query("INSERT INTO inv_lab.versions(parent_version_id,source_version_id,filename,file_sha256,file_storage_key,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text AS id", [baseId, sourceId, "restore-v" + sourceId + ".xlsx", src.file_sha256, src.file_storage_key, actor]);
      const draftId = v.rows[0].id;
      await db.query("INSERT INTO inv_lab.items(version_id,code,description,quantity,location,extra) SELECT $1,code,description,quantity,location,extra FROM inv_lab.items WHERE version_id=$2", [draftId, sourceId]);
      await db.query("INSERT INTO inv_lab.audit(event,version_id,base_version_id,actor,metadata) VALUES('RESTORE_REQUESTED',$1,$2,$3,jsonb_build_object('restoredFrom',$4::text))", [draftId, baseId, actor, sourceId]);
      await db.query("SELECT inv_lab.seal_version($1,$2)", [draftId, actor]);
      return { draftId, baseVersionId: baseId };
    });
  }
};

// ops/maintrack/inventory/backend/src/inventory-service.mjs
import { createHash as createHash4, timingSafeEqual } from "node:crypto";
var hex = (value) => createHash4("sha256").update(JSON.stringify(value)).digest("hex");
function receipt(diff) {
  return hex({
    draftId: diff.draftId,
    base: diff.baseVersionId,
    sha: diff.fileSha256,
    counts: diff.counts,
    items: diff.details
  });
}
function identical(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
function createInventoryService({ verifySession, store, parseXlsx } = {}) {
  if (typeof verifySession !== "function" || !store) throw Error("TRUSTED_SESSION_ADAPTER_REQUIRED");
  return {
    async execute(input = {}) {
      const action = String(input.action || "");
      const identity = await verifySession(input.session);
      const permission = {
        inventoryVersion: "search",
        inventorySearch: "search",
        inventorySearchPage: "search",
        inventoryItem: "details",
        inventoryDraft: "upload",
        inventoryDiff: "diff",
        inventoryPublish: "publish",
        inventoryHistory: "versions:list",
        inventoryRestore: "restore"
      }[action];
      if (!permission) throw Error("UNKNOWN_ACTION");
      const authorized = authorizeInventoryAction(identity, permission);
      const actor = String(authorized.userId || "").trim();
      if (!actor) throw Error("VERIFIED_USER_ID_REQUIRED");
      switch (action) {
        case "inventoryVersion":
          return store.current();
        case "inventorySearch":
          return store.search(input.query, input.limit);
        case "inventorySearchPage":
          return store.searchPage(input.query, { limit: input.limit, offset: input.offset, versionId: input.versionId });
        case "inventoryItem":
          return store.item(input.code);
        case "inventoryDraft": {
          if (typeof parseXlsx !== "function") throw Error("XLSX_PARSER_NOT_CONFIGURED");
          const buffer = input.bytes;
          const parsed = await parseXlsx(buffer, { filename: input.filename });
          const staged = await store.stage({ ...parsed, buffer: Buffer.from(buffer), actor });
          const diff = await store.diff(staged.draftId);
          return { ...staged, summary: {
            total: diff.total,
            counts: diff.counts,
            requiresExplicitReview: diff.requiresExplicitReview
          }, reviewReceipt: receipt(diff) };
        }
        case "inventoryDiff": {
          const diff = await store.diff(input.draftId);
          const limit = input.limit === void 0 ? 100 : Number(input.limit);
          const offset = input.offset === void 0 ? 0 : Number(input.offset);
          if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw Error("INVALID_LIMIT");
          if (!Number.isInteger(offset) || offset < 0 || offset > 3e4) throw Error("INVALID_OFFSET");
          const details = diff.details.slice(offset, offset + limit);
          const hasMore = offset + details.length < diff.details.length;
          return {
            draftId: diff.draftId,
            baseVersionId: diff.baseVersionId,
            currentVersionId: diff.currentVersionId,
            isStale: diff.baseVersionId !== diff.currentVersionId,
            filename: diff.filename,
            counts: diff.counts,
            total: diff.total,
            requiresExplicitReview: diff.requiresExplicitReview,
            reviewReceipt: receipt(diff),
            details,
            offset,
            limit,
            detailsTotal: diff.details.length,
            hasMore,
            nextOffset: hasMore ? offset + details.length : null,
            truncated: hasMore
          };
        }
        case "inventoryPublish": {
          if (input.confirmReviewed !== true) throw Error("OWNER_REVIEW_REQUIRED");
          const diff = await store.diff(input.draftId);
          if (diff.currentVersionId !== diff.baseVersionId) throw Error("STALE_BASE_RECOMPARE_REQUIRED");
          if (!identical(input.reviewReceipt, receipt(diff))) throw Error("REVIEW_RECEIPT_MISMATCH");
          if (diff.requiresExplicitReview && input.acknowledgeLargeAbsence !== true)
            throw Error("LARGE_ABSENCE_NEEDS_EXPLICIT_APPROVAL");
          return store.publish(diff.draftId, diff.baseVersionId, actor);
        }
        case "inventoryHistory":
          return store.history(input.limit);
        case "inventoryRestore": {
          const staged = await store.stageRestore(input.sourceVersionId, actor);
          const diff = await store.diff(staged.draftId);
          return {
            ...staged,
            summary: { total: diff.total, counts: diff.counts },
            reviewReceipt: receipt(diff),
            requiresSeparatePublish: true
          };
        }
      }
    }
  };
}

// ops/maintrack/inventory/backend/src/create-review-runtime.mjs
async function createReviewInventoryRuntime({ verifySession, pool: pool2, storage: storage2, bucket: bucket2 } = {}) {
  if (typeof verifySession !== "function" || !pool2?.query || !pool2?.connect)
    throw Error("TRUSTED_SESSION_AND_DB_REQUIRED");
  const privateFiles = await createPrivateBucketArchive({ storage: storage2, bucket: bucket2 });
  const store = new PostgresInventoryStore({ pool: pool2, privateFiles });
  return Object.freeze({
    service: createInventoryService({ verifySession, store, parseXlsx: parseInventoryXlsx })
    // No raw storage bucket, database pool, credentials or unrestricted file method
    // is exposed to a client handler.
  });
}

// ops/maintrack/inventory/backend/src/http-adapter.mjs
var MAX_BODY = 4 * 1024 * 1024;
var MAX_XLSX_BYTES = 2 * 1024 * 1024;
var jsonHeaders = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" };
var allowedMethods = "POST, OPTIONS";
var allowedHeaders = "Authorization, Content-Type";
function makeResponse(status, body, origin = null) {
  const h = { ...jsonHeaders, "vary": "Origin" };
  if (origin) h["access-control-allow-origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers: h });
}
async function limitedJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(len) && len > MAX_BODY) throw Error("REQUEST_TOO_LARGE");
  if (!request.body) throw Error("REQUEST_BODY_REQUIRED");
  const chunks = [], reader = request.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) throw Error("REQUEST_TOO_LARGE");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel().catch(() => {
    });
    throw e;
  }
  const bytes = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    bytes.set(c, off);
    off += c.length;
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw Error("INVALID_JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error("INVALID_JSON_OBJECT");
  return { payload, bytesLength: size };
}
function decodeUpload(str) {
  if (typeof str !== "string" || str.length < 100 || str.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(str))
    throw Error("INVALID_XLSX_ENCODING");
  if (str.length > Math.ceil(MAX_XLSX_BYTES / 3) * 4 + 8) throw Error("XLSX_DIRECT_UPLOAD_REQUIRED");
  const bytes = Buffer.from(str, "base64");
  if (bytes.length > MAX_XLSX_BYTES) throw Error("XLSX_DIRECT_UPLOAD_REQUIRED");
  if (!bytes.length || bytes.toString("base64") !== str) throw Error("INVALID_XLSX_ENCODING");
  return bytes;
}
var codeFor = (err) => {
  if (/REQUEST_TOO_LARGE|XLSX_DIRECT_UPLOAD_REQUIRED/.test(err)) return 413;
  if (/UNAUTHENTICATED|VERIFIED_USER_ID_REQUIRED/.test(err)) return 401;
  if (/FORBIDDEN/.test(err)) return 403;
  if (/STALE_BASE|NOT_PENDING|REVIEW_RECEIPT_MISMATCH|INVENTORY_VERSION_CHANGED_RESTART_SEARCH/.test(err)) return 409;
  if (/UNKNOWN_ACTION|INVALID_JSON|REQUEST_TOO_LARGE|REQUEST_BODY_REQUIRED|INVALID_XLSX_ENCODING|INVALID_QUERY|INVALID_LIMIT|INVALID_OFFSET|ONLY_XLSX|INVALID_FILE|DUPLICATE_|MISSING_|REQUIRED_|SUSPICIOUS_|OWNER_REVIEW_REQUIRED|LARGE_ABSENCE|FORMULA_|HYPERLINK_|XLSX_|INVALID_QUANTITY|INVALID_REQUIRED_FIELD/.test(err)) return 422;
  return 500;
};
function createInventoryHttpHandler({ service, allowedOrigins: allowedOrigins2 } = {}) {
  if (!service || typeof service.execute !== "function") throw Error("INVENTORY_SERVICE_REQUIRED");
  if (!Array.isArray(allowedOrigins2) || !allowedOrigins2.length || allowedOrigins2.some((o) => !/^https:\/\/[^/]+$/i.test(o)))
    throw Error("EXPLICIT_HTTPS_ALLOWED_ORIGINS_REQUIRED");
  const allow = new Set(allowedOrigins2);
  return async function handle(request) {
    const origin = request.headers.get("origin");
    if (origin && !allow.has(origin)) return makeResponse(403, { ok: false, error: "ORIGIN_FORBIDDEN" });
    const supported = request.method === "OPTIONS" || request.method === "POST";
    if (!supported) return makeResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, origin);
    if (request.method === "OPTIONS") {
      if (!origin) return makeResponse(400, { ok: false, error: "ORIGIN_REQUIRED" });
      if (request.headers.get("access-control-request-method") !== "POST")
        return makeResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" }, origin);
      const headers = new Headers({
        ...jsonHeaders,
        "vary": "Origin",
        "access-control-allow-origin": origin,
        "access-control-allow-methods": allowedMethods,
        "access-control-allow-headers": allowedHeaders,
        "access-control-max-age": "600"
      });
      return new Response(null, { status: 204, headers });
    }
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!/^[a-f0-9]{64}$/i.test(token)) return makeResponse(401, { ok: false, error: "UNAUTHENTICATED" }, origin);
    const contentType = request.headers.get("content-type") || "";
    if (!/^application\/json(?:\s*;.*)?$/i.test(contentType))
      return makeResponse(415, { ok: false, error: "JSON_ONLY" }, origin);
    try {
      const { payload, bytesLength } = await limitedJson(request);
      if (typeof payload.action !== "string") throw Error("UNKNOWN_ACTION");
      if (payload.action !== "inventoryDraft" && bytesLength > 32768) throw Error("REQUEST_TOO_LARGE");
      const input = { ...payload };
      delete input.role;
      delete input.userId;
      delete input.session;
      if (input.action === "inventoryDraft") {
        input.bytes = decodeUpload(input.fileBase64);
      }
      delete input.fileBase64;
      input.session = token.toLowerCase();
      const data = await service.execute(input);
      return makeResponse(200, { ok: true, data }, origin);
    } catch (error) {
      const code2 = String(error?.message || "INTERNAL");
      const status = codeFor(code2);
      return makeResponse(status, { ok: false, error: status === 500 ? "INTERNAL_ERROR" : code2.split(":")[0] }, origin);
    }
  };
}

// ops/maintrack/inventory/backend/src/create-review-http-handler.mjs
async function createReviewInventoryHttpHandler({
  pool: pool2,
  storage: storage2,
  bucket: bucket2,
  allowedOrigins: allowedOrigins2
} = {}) {
  if (!pool2?.query || !pool2?.connect) throw Error("PRIVATE_POSTGRES_POOL_REQUIRED");
  const verifySession = createMainTrackOpaqueSessionVerifier({ pool: pool2 });
  const runtime = await createReviewInventoryRuntime({
    verifySession,
    pool: pool2,
    storage: storage2,
    bucket: bucket2
  });
  return createInventoryHttpHandler({ service: runtime.service, allowedOrigins: allowedOrigins2 });
}

// supabase/functions/maintrack-inventory-047-qa/entry.mjs
globalThis.Buffer ??= Buffer2;
var url = Deno.env.get("SUPABASE_URL");
var key2 = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var pool = new pg.Pool({ connectionString: Deno.env.get("SUPABASE_DB_URL"), max: 2, idleTimeoutMillis: 1e4, connectionTimeoutMillis: 7e3 });
var bucket = "maintrack-inventory-archive-staging";
var allowedOrigins = ["https://localhost", "https://maintrack-final-security-b0ib33obd-mohamedashrefsrag-5918.vercel.app"];
async function storageRequest(path, { method = "GET", body, headers = {} } = {}) {
  const response2 = await fetch(url + "/storage/v1/" + path, { method, headers: { Authorization: "Bearer " + key2, apikey: key2, ...headers }, body, signal: AbortSignal.timeout(3e4) });
  if (!response2.ok) return { error: { code: "PRIVATE_STORAGE_REQUEST_FAILED" } };
  return { response: response2 };
}
var storage = {
  async getBucket(id) {
    const result = await storageRequest("bucket/" + encodeURIComponent(id));
    return result.error ? result : { data: await result.response.json() };
  },
  from(id) {
    const object = (key3) => "object/" + encodeURIComponent(id) + "/" + key3.split("/").map(encodeURIComponent).join("/");
    return {
      async upload(key3, bytes, options) {
        const r = await storageRequest(object(key3), { method: "POST", headers: { "Content-Type": options.contentType, "x-upsert": "false" }, body: bytes });
        return r.error ? r : { data: { path: key3 } };
      },
      async download(key3) {
        const r = await storageRequest(object(key3));
        return r.error ? r : { data: await r.response.blob() };
      },
      async remove(keys) {
        const r = await storageRequest("object/" + encodeURIComponent(id), { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: keys }) });
        return r.error ? r : { data: true };
      }
    };
  }
};
var ready;
var response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async (request) => {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path.endsWith("/healthz")) return response({ service: "maintrack-inventory-047-qa", status: "up" });
  if (!["POST", "OPTIONS"].includes(request.method)) return response({ ok: false, error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    if (!url || !key2 || !Deno.env.get("SUPABASE_DB_URL")) throw Error("INVENTORY_NOT_CONFIGURED");
    ready ??= createReviewInventoryHttpHandler({ pool, storage, bucket, allowedOrigins }).catch((e) => {
      ready = null;
      throw e;
    });
    return await (await ready)(request);
  } catch {
    const origin = request.headers.get("origin");
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Vary": "Origin" };
    if (allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
    return new Response(JSON.stringify({ ok: false, error: "INVENTORY_NOT_READY" }), { status: 503, headers });
  }
});
