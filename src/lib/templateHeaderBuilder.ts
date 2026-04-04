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

  // Shared cell styles — kept as constants to keep the template readable
  const BORDER = 'border:1.5px solid #000;';
  const BASE = `${BORDER}padding:3px 6px;vertical-align:middle;font-size:9pt;`;
  const LABEL = `${BASE}white-space:nowrap;`;
  const VALUE = `${BASE}`;
  const CENTER = `${BASE}text-align:center;`;

  return `
<div class="docx-template-header" style="margin-bottom:14px;font-family:'Noto Sans Gujarati','Shruti','Nirmala UI','Arial Unicode MS',sans-serif;font-size:9pt;color:#000;">
  <!--
    Outer layout: title bar (left) + logo (right)
    Then the 5-column metadata table
    Then the signature row
  -->
  <!-- Title + logo row -->
  <table style="width:100%;border-collapse:collapse;margin-bottom:0;" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:0 0 4px 0;vertical-align:bottom;">
        <span style="font-size:11pt;font-weight:normal;font-family:'Noto Sans Gujarati','Shruti','Nirmala UI','Arial Unicode MS',sans-serif;">પ્રમાણસર કાર્ય કરવાની પદ્ધતિ</span>
      </td>
      <td style="padding:0 0 4px 0;text-align:right;vertical-align:middle;width:52px;">
        ${logo ? `<img src="${logo}" alt="logo" style="width:48px;height:48px;object-fit:contain;display:inline-block;" />` : ''}
      </td>
    </tr>
  </table>

  <!-- Metadata table: matches PDF layout exactly -->
  <!--
    Columns (approximate % of usable width):
      Col A: Company name block  ~17%
      Col B: Label (Dept/Area/Subject)  ~13%
      Col C: Colon separator  ~2%
      Col D: Value (Dept value / Subject text)  ~28%
      Col E: Right label (SOP No / Page No / dates)  ~17%
      Col F: Right value  ~23%
  -->
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-family:'Noto Sans Gujarati','Shruti','Nirmala UI','Arial Unicode MS',sans-serif;font-size:9pt;color:#000;" cellpadding="0" cellspacing="0">
    <colgroup>
      <col style="width:17%;" />
      <col style="width:13%;" />
      <col style="width:3%;" />
      <col style="width:27%;" />
      <col style="width:18%;" />
      <col style="width:22%;" />
    </colgroup>

    <!-- Row 1: Company | DEPARTMENT : value | SOP NO. : value -->
    <tr>
      <td rowspan="5" style="${BORDER}text-align:center;vertical-align:middle;padding:4px;font-size:9pt;font-weight:700;line-height:1.6;">
        ઇન્ડિયાના<br/>ઓફ્થાલ્મિક્સ<br/>એલ.એલ.પી
      </td>
      <td style="${LABEL}font-weight:700;">વિભાગ</td>
      <td style="${CENTER}font-weight:700;">:</td>
      <td style="${VALUE}">${e(data.department)}</td>
      <td style="${LABEL}">એસ.ઓ.પી.નં.</td>
      <td style="${CENTER}">${e(normalizeSopNo(data.sopNo))}</td>
    </tr>

    <!-- Row 2: | AREA : value | PAGE NO. : value -->
    <tr>
      <td style="${LABEL}font-weight:700;">શાખા</td>
      <td style="${CENTER}font-weight:700;">:</td>
      <td style="${VALUE}">${e(data.area)}</td>
      <td style="${LABEL}">પેજ નંબર</td>
      <td style="${CENTER}"></td>
    </tr>

    <!-- Row 3: | SUBJECT (spans 2 rows of label+colon+value) | EFF DATE : value -->
    <tr>
      <td colspan="3" rowspan="3" style="${BORDER}padding:4px 6px;vertical-align:top;word-break:break-word;font-size:9pt;">
        <span style="font-weight:700;">વિષય :</span> ${e(data.subject)}
      </td>
      <td style="${LABEL}">લાગુ&nbsp;પડેલ&nbsp;તારીખ</td>
      <td style="${CENTER}">${e(eff)}</td>
    </tr>

    <!-- Row 4: | | REVIEW DT. : value -->
    <tr>
      <td style="${LABEL}">ફેરચકાસણી&nbsp;તારીખ</td>
      <td style="${CENTER}">${e(rev)}</td>
    </tr>

    <!-- Row 5: | | SUPERSEDES : value -->
    <tr>
      <td style="${LABEL}">રદ&nbsp;કરેલ&nbsp;નં.</td>
      <td style="${CENTER}">${e(data.supersedes)}</td>
    </tr>

    <!-- Row 6: header label row — col A (label) | col B+C+D (prepared) | col E (checked) | col F (approved) -->
    <tr>
      <td style="${BORDER}padding:3px 6px;vertical-align:middle;font-size:9pt;text-align:center;"></td>
      <td colspan="3" style="${BORDER}padding:3px 6px;text-align:center;vertical-align:middle;font-size:9pt;">બનાવનાર</td>
      <td style="${BORDER}padding:3px 6px;text-align:center;vertical-align:middle;font-size:9pt;">તપાસનાર</td>
      <td style="${BORDER}padding:3px 6px;text-align:center;vertical-align:middle;font-size:9pt;">પ્રમાણિત&nbsp;કરનાર</td>
    </tr>

    <!-- Row 7: SIGNATURE row -->
    <tr>
      <td style="${BORDER}padding:3px 6px;text-align:center;vertical-align:middle;font-size:9pt;font-weight:700;">સહી</td>
      <td colspan="3" style="${BORDER}padding:3px 6px;min-height:32px;height:32px;"></td>
      <td style="${BORDER}padding:3px 6px;min-height:32px;height:32px;"></td>
      <td style="${BORDER}padding:3px 6px;min-height:32px;height:32px;"></td>
    </tr>

    <!-- Row 8: NAME row -->
    <tr>
      <td style="${BORDER}padding:3px 6px;text-align:center;vertical-align:middle;font-size:9pt;font-weight:700;">નામ</td>
      <td colspan="3" style="${BORDER}padding:3px 6px;min-height:24px;height:24px;"></td>
      <td style="${BORDER}padding:3px 6px;min-height:24px;height:24px;"></td>
      <td style="${BORDER}padding:3px 6px;min-height:24px;height:24px;"></td>
    </tr>

    <!-- Row 9: DATE row -->
    <tr>
      <td style="${BORDER}padding:3px 6px;text-align:center;vertical-align:middle;font-size:9pt;font-weight:700;">તારીખ</td>
      <td colspan="3" style="${BORDER}padding:3px 6px;min-height:24px;height:24px;"></td>
      <td style="${BORDER}padding:3px 6px;min-height:24px;height:24px;"></td>
      <td style="${BORDER}padding:3px 6px;min-height:24px;height:24px;"></td>
    </tr>
  </table>
</div>`;
}
