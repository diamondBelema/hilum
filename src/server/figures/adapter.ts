import type { FigureCandidate } from "./service.ts";

export type FigureSource = {
  id: string;
  name: string;
  hosts: string[];
  enabled: boolean;
  license_policy: string;
};

export interface FigureAdapter {
  id: string;
  name: string;
  hosts: string[];
  enabled: boolean;
  license_policy: string;
  search(query: string, limit?: number): Promise<FigureCandidate[]>;
  resolve(idOrUrl: string): Promise<FigureCandidate | null>;
}

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

function isSvg(url: string | null): boolean {
  if (!url) return false;
  return /\.svg(\?|$)/i.test(url);
}

export class CommonsAdapter implements FigureAdapter {
  id = "commons";
  name = "Wikimedia Commons";
  hosts = ["commons.wikimedia.org", "upload.wikimedia.org"];
  enabled = true;
  license_policy = "Per-file; stored at registration, unclear licenses rejected";

  async search(query: string, limit = 10): Promise<FigureCandidate[]> {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: query,
      gsrnamespace: "6", // File namespace
      gsrlimit: String(Math.min(limit, 10)),
      prop: "imageinfo",
      iiprop: "url|size|extmetadata|mime",
      iiurlwidth: "400",
    });
    const url = `${COMMONS_API}?${params.toString()}`;
    const response = await fetch(url, { headers: { "User-Agent": "Hilum/1.0" } });
    if (!response.ok) throw new Error(`Commons search failed: ${response.status}`);
    const data = await response.json();
    const pages = data.query?.pages ?? {};
    const candidates: FigureCandidate[] = [];
    for (const pageId of Object.keys(pages)) {
      const page = pages[pageId];
      const imageInfo = page.imageinfo?.[0];
      if (!imageInfo) continue;
      const mime = imageInfo.mime ?? "";
      const kind = mime.includes("svg") ? "svg" : "raster";
      const extmetadata = imageInfo.extmetadata ?? {};
      const license = extmetadata.LicenseShortName?.value ?? extmetadata.UsageTerms?.value ?? null;
      const author = extmetadata.Artist?.value ?? null;
      const attributionRequired = Boolean(license && !license.toLowerCase().includes("public domain"));
      candidates.push({
        source: "commons",
        source_id: page.title.replace("File:", ""),
        title: page.title.replace("File:", ""),
        thumbnail_url: imageInfo.thumburl ?? null,
        file_url: imageInfo.url ?? null,
        kind,
        width: imageInfo.width ?? null,
        height: imageInfo.height ?? null,
        license,
        author,
        attribution_required: attributionRequired,
      });
    }
    return candidates;
  }

  async resolve(idOrUrl: string): Promise<FigureCandidate | null> {
    let title: string;
    if (idOrUrl.startsWith("File:")) {
      title = idOrUrl;
    } else if (idOrUrl.includes("commons.wikimedia.org/wiki/File:")) {
      const match = idOrUrl.match(/wiki\/File:([^/?]+)/);
      if (!match) return null;
      title = `File:${match[1]}`;
    } else {
      title = `File:${idOrUrl}`;
    }

    const params = new URLSearchParams({
      action: "query",
      format: "json",
      titles: title,
      prop: "imageinfo",
      iiprop: "url|size|extmetadata|mime",
      iiurlwidth: "400",
    });
    const url = `${COMMONS_API}?${params.toString()}`;
    const response = await fetch(url, { headers: { "User-Agent": "Hilum/1.0" } });
    if (!response.ok) return null;
    const data = await response.json();
    const pages = data.query?.pages ?? {};
    const pageId = Object.keys(pages)[0];
    if (!pageId || pageId === "-1") return null;
    const page = pages[pageId];
    const imageInfo = page.imageinfo?.[0];
    if (!imageInfo) return null;
    const mime = imageInfo.mime ?? "";
    const kind = mime.includes("svg") ? "svg" : "raster";
    const extmetadata = imageInfo.extmetadata ?? {};
    const license = extmetadata.LicenseShortName?.value ?? extmetadata.UsageTerms?.value ?? null;
    const author = extmetadata.Artist?.value ?? null;
    const attributionRequired = Boolean(license && !license.toLowerCase().includes("public domain"));
    return {
      source: "commons",
      source_id: (page.title ?? "").replace("File:", ""),
      title: (page.title ?? "").replace("File:", ""),
      thumbnail_url: imageInfo.thumburl ?? null,
      file_url: imageInfo.url ?? null,
      kind,
      width: imageInfo.width ?? null,
      height: imageInfo.height ?? null,
      license,
      author,
      attribution_required: attributionRequired,
    };
  }
}

export class PubChemAdapter implements FigureAdapter {
  id = "pubchem";
  name = "PubChem";
  hosts = ["pubchem.ncbi.nlm.nih.gov"];
  enabled = false;
  license_policy = "Record per item; check the record's source";

  async search(query: string, limit = 10): Promise<FigureCandidate[]> {
    const cidUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/cids/JSON?limit=${Math.min(limit, 10)}`;
    const cidResponse = await fetch(cidUrl);
    if (!cidResponse.ok) return [];
    const cidData = await cidResponse.json();
    const cids = cidData.IdentifierList?.CID ?? [];
    const candidates: FigureCandidate[] = [];
    for (const cid of cids.slice(0, limit)) {
      try {
        const propsUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title,MolecularFormula/JSON`;
        const propsResponse = await fetch(propsUrl);
        if (!propsResponse.ok) continue;
        const propsData = await propsResponse.json();
        const prop = propsData.PropertyTable?.Properties?.[0];
        const title = prop?.Title ?? `CID ${cid}`;
        const imageUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=256x256`;
        candidates.push({
          source: "pubchem",
          source_id: String(cid),
          title,
          thumbnail_url: imageUrl,
          file_url: imageUrl,
          kind: "raster",
          width: 256,
          height: 256,
          license: "PubChem (per record)",
          author: null,
          attribution_required: true,
        });
      } catch {
        continue;
      }
    }
    return candidates;
  }

  async resolve(idOrUrl: string): Promise<FigureCandidate | null> {
    const cidMatch = idOrUrl.match(/cid\/(\d+)/i) || idOrUrl.match(/^(\d+)$/);
    if (!cidMatch) return null;
    const cid = cidMatch[1];
    try {
      const propsUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/property/Title/JSON`;
      const propsResponse = await fetch(propsUrl);
      if (!propsResponse.ok) return null;
      const propsData = await propsResponse.json();
      const prop = propsData.PropertyTable?.Properties?.[0];
      const imageUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/PNG?image_size=256x256`;
      return {
        source: "pubchem",
        source_id: cid,
        title: prop?.Title ?? `CID ${cid}`,
        thumbnail_url: imageUrl,
        file_url: imageUrl,
        kind: "raster",
        width: 256,
        height: 256,
        license: "PubChem (per record)",
        author: null,
        attribution_required: true,
      };
    } catch {
      return null;
    }
  }
}

export class RCSBAdapter implements FigureAdapter {
  id = "rcsb";
  name = "RCSB PDB";
  hosts = ["search.rcsb.org", "data.rcsb.org", "files.rcsb.org", "cdn.rcsb.org"];
  enabled = false;
  license_policy = "Per entry; record it";

  async search(query: string, limit = 10): Promise<FigureCandidate[]> {
    const searchQuery = {
      query: {
        type: "terminal",
        service: "full_text",
        parameters: { attribute: "struct.title", operator: "contains_words", value: query },
      },
      return_type: "entry",
      request_options: { paginate: { start: 0, rows: Math.min(limit, 10) } },
    };
    try {
      const searchResponse = await fetch("https://search.rcsb.org/rcsbsearch/v2/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchQuery),
      });
      if (!searchResponse.ok) return [];
      const searchData = await searchResponse.json();
      const ids = searchData.result_set?.map((r: any) => r.identifier) ?? [];
      const candidates: FigureCandidate[] = [];
      for (const id of ids.slice(0, limit)) {
        try {
          const dataUrl = `https://data.rcsb.org/rest/v1/core/entry/${id}`;
          const dataResponse = await fetch(dataUrl);
          if (!dataResponse.ok) continue;
          const data = await dataResponse.json();
          const title = data.struct?.title ?? `RCSB ${id}`;
          const imageUrl = `https://cdn.rcsb.org/images/structures/${id}-assembly1.png`;
          candidates.push({
            source: "rcsb",
            source_id: id,
            title,
            thumbnail_url: imageUrl,
            file_url: imageUrl,
            kind: "raster",
            width: null,
            height: null,
            license: "RCSB PDB (per entry)",
            author: null,
            attribution_required: true,
          });
        } catch {
          continue;
        }
      }
      return candidates;
    } catch {
      return [];
    }
  }

  async resolve(idOrUrl: string): Promise<FigureCandidate | null> {
    const idMatch = idOrUrl.match(/([A-Z0-9]{4})/) || idOrUrl.match(/rcsb\.org\/([A-Z0-9]{4})/i);
    if (!idMatch) return null;
    const id = idMatch[1];
    try {
      const dataUrl = `https://data.rcsb.org/rest/v1/core/entry/${id}`;
      const dataResponse = await fetch(dataUrl);
      if (!dataResponse.ok) return null;
      const data = await dataResponse.json();
      const title = data.struct?.title ?? `RCSB ${id}`;
      const imageUrl = `https://cdn.rcsb.org/images/structures/${id}-assembly1.png`;
      return {
        source: "rcsb",
        source_id: id,
        title,
        thumbnail_url: imageUrl,
        file_url: imageUrl,
        kind: "raster",
        width: null,
        height: null,
        license: "RCSB PDB (per entry)",
        author: null,
        attribution_required: true,
      };
    } catch {
      return null;
    }
  }
}

const ENABLED_ADAPTERS: FigureAdapter[] = [new CommonsAdapter(), new PubChemAdapter(), new RCSBAdapter()];

export function getAdapters(): FigureAdapter[] {
  return ENABLED_ADAPTERS.filter((a) => a.enabled);
}

export function getAdapter(id: string): FigureAdapter | undefined {
  return ENABLED_ADAPTERS.find((a) => a.id === id);
}

export function getSources(): FigureSource[] {
  return ENABLED_ADAPTERS.map((a) => ({
    id: a.id,
    name: a.name,
    hosts: a.hosts,
    enabled: a.enabled,
    license_policy: a.license_policy,
  }));
}

export async function searchAll(query: string, limit = 10): Promise<FigureCandidate[]> {
  const results: FigureCandidate[] = [];
  for (const adapter of getAdapters()) {
    try {
      const found = await adapter.search(query, limit);
      results.push(...found);
    } catch {
      // Adapter failure is not fatal
    }
  }
  return results.slice(0, limit);
}

export async function resolveAll(idOrUrl: string): Promise<FigureCandidate | null> {
  // Try Commons first (most likely for URLs/titles containing commons)
  for (const adapter of getAdapters()) {
    try {
      const found = await adapter.resolve(idOrUrl);
      if (found) return found;
    } catch {
      // Continue to next adapter
    }
  }
  return null;
}
