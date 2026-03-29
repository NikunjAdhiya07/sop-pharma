import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';

let cachedLogoDataUri: string | null = null;

function getLogoDataUri(): string {
  if (cachedLogoDataUri) return cachedLogoDataUri;
  try {
    const templatePath = path.join(process.cwd(), 'template', 'template.docx');
    const zip = new AdmZip(templatePath);
    const imgEntry = zip.getEntry('word/media/image1.jpeg');
    if (imgEntry) {
      const b64 = imgEntry.getData().toString('base64');
      cachedLogoDataUri = `data:image/jpeg;base64,${b64}`;
      return cachedLogoDataUri;
    }
  } catch { /* fall through */ }
  cachedLogoDataUri = '';
  return cachedLogoDataUri;
}

export interface TemplateHeaderData {
  department: string;
  area: string;
  sopNo: string;
  effectiveDate: string;
  reviewDate: string;
  supersedes: string;
  subject: string;
}

function formatDateForHeader(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch {
    return isoDate;
  }
}

function normalizeSopNo(sopNo: string): string {
  if (!sopNo) return sopNo;
  // Ensure revision number is zero-padded to at least 2 digits: BSGE01-4 → BSGE01-04
  return sopNo.replace(/(-.+?-)?(\d+)$/, (_, prefix, rev) => {
    const padded = rev.padStart(2, '0');
    return prefix ? `${prefix}${padded}` : `-${padded}`;
  }).replace(/^(.*?)-(\d+)$/, (_, base, rev) => `${base}-${rev.padStart(2, '0')}`);
}

export function buildTemplateHeaderHtml(data: TemplateHeaderData): string {
  const logo = getLogoDataUri();
  const eff = formatDateForHeader(data.effectiveDate);
  const rev = formatDateForHeader(data.reviewDate);

  const e = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `
<div class="docx-header" style="margin-bottom:16px;">
  <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
    ${logo ? `<img src="${logo}" alt="logo" style="width:40px;height:40px;" />` : ''}
    <span style="font-family:'Times New Roman',serif;font-size:12pt;font-weight:normal;">STANDARD OPERATING PROCEDURE</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-family:'Times New Roman',serif;font-size:11pt;color:#000;" cellpadding="0" cellspacing="0">
    <colgroup>
      <col style="width:18%;" />
      <col style="width:14%;" />
      <col style="width:2%;" />
      <col style="width:26%;" />
      <col style="width:14%;" />
      <col style="width:2%;" />
      <col style="width:14%;" />
    </colgroup>
    <!-- Row 1: Department / SOP No -->
    <tr>
      <td rowspan="5" style="border:1px solid #000;text-align:center;vertical-align:middle;font-weight:700;padding:6px;">
        INDIANA<br/>OPHTHALMICS<br/>LLP
      </td>
      <td style="border:1px solid #000;border-right:none;padding:4px 6px;font-weight:700;vertical-align:middle;">DEPARTMENT</td>
      <td style="border:1px solid #000;border-left:none;border-right:none;padding:4px 2px;font-weight:700;vertical-align:middle;">:</td>
      <td style="border:1px solid #000;border-left:none;padding:4px 6px;vertical-align:middle;">${e(data.department)}</td>
      <td style="border:1px solid #000;border-right:none;padding:4px 6px;vertical-align:middle;">SOP NO.</td>
      <td style="border:1px solid #000;border-left:none;border-right:none;padding:4px 2px;vertical-align:middle;">:</td>
      <td style="border:1px solid #000;border-left:none;padding:4px 6px;text-align:center;vertical-align:middle;">${e(normalizeSopNo(data.sopNo))}</td>
    </tr>
    <!-- Row 2: Area / Page No -->
    <tr>
      <td style="border:1px solid #000;border-right:none;padding:4px 6px;font-weight:700;vertical-align:middle;">AREA</td>
      <td style="border:1px solid #000;border-left:none;border-right:none;padding:4px 2px;font-weight:700;vertical-align:middle;">:</td>
      <td style="border:1px solid #000;border-left:none;padding:4px 6px;vertical-align:middle;">${e(data.area)}</td>
      <td style="border:1px solid #000;border-right:none;padding:4px 6px;vertical-align:middle;">PAGE NO.</td>
      <td style="border:1px solid #000;border-left:none;border-right:none;padding:4px 2px;vertical-align:middle;">:</td>
      <td style="border:1px solid #000;border-left:none;padding:4px 6px;text-align:center;vertical-align:middle;">—</td>
    </tr>
    <!-- Row 3: Subject / Eff. Dt. -->
    <tr>
      <td colspan="3" rowspan="3" style="border:1px solid #000;padding:4px 6px;vertical-align:top;">
        <span style="font-weight:700;">SUBJECT :</span><br/>${e(data.subject)}
      </td>
      <td style="border:1px solid #000;border-right:none;padding:4px 6px;vertical-align:middle;">EFF. DT.</td>
      <td style="border:1px solid #000;border-left:none;border-right:none;padding:4px 2px;vertical-align:middle;">:</td>
      <td style="border:1px solid #000;border-left:none;padding:4px 6px;text-align:center;vertical-align:middle;">${e(eff)}</td>
    </tr>
    <!-- Row 4: Review Dt. -->
    <tr>
      <td style="border:1px solid #000;border-right:none;padding:4px 6px;vertical-align:middle;">REVIEW DT.</td>
      <td style="border:1px solid #000;border-left:none;border-right:none;padding:4px 2px;vertical-align:middle;">:</td>
      <td style="border:1px solid #000;border-left:none;padding:4px 6px;text-align:center;vertical-align:middle;">${e(rev)}</td>
    </tr>
    <!-- Row 5: Supersedes -->
    <tr>
      <td style="border:1px solid #000;border-right:none;padding:4px 6px;vertical-align:middle;">SUPERSEDES</td>
      <td style="border:1px solid #000;border-left:none;border-right:none;padding:4px 2px;vertical-align:middle;">:</td>
      <td style="border:1px solid #000;border-left:none;padding:4px 6px;text-align:center;vertical-align:middle;">${e(data.supersedes)}</td>
    </tr>
    <!-- Row 6: Prepared / Checked / Approved -->
    <tr>
      <td rowspan="3" style="border:1px solid #000;padding:4px 6px;vertical-align:top;font-weight:400;">
        SIGNATURE<br/><br/>NAME<br/><br/>DATE
      </td>
      <td colspan="3" style="border:1px solid #000;padding:4px 6px;text-align:center;vertical-align:top;">
        <div style="font-weight:400;margin-bottom:4px;">PREPARED BY</div>
        <div style="min-height:40px;"></div>
      </td>
      <td colspan="3" style="border:1px solid #000;padding:4px 6px;text-align:center;vertical-align:top;" class="sop-hdr-checked">
        <div style="font-weight:400;margin-bottom:4px;">CHECKED BY</div>
        <div style="min-height:40px;"></div>
      </td>
    </tr>
    <tr>
      <td colspan="3" style="border:1px solid #000;padding:4px 6px;text-align:center;vertical-align:top;">
        <div style="font-weight:400;margin-bottom:4px;">APPROVED BY</div>
        <div style="min-height:40px;"></div>
      </td>
      <td colspan="3" style="border:1px solid #000;padding:4px 6px;text-align:center;vertical-align:middle;">
      </td>
    </tr>
    <tr>
      <td colspan="6" style="border:none;padding:0;"></td>
    </tr>
  </table>
</div>`;
}
