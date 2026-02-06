/**
 * Adds a "CONTROLLED COPY" watermark and footer details to a PDF.
 * @param pdfBuffer The ArrayBuffer of the original PDF.
 * @param details Object containing user context for the watermark.
 * @returns Promise resolving to the watermarked PDF as a Uint8Array.
 */
export async function watermarkSOP(
  pdfBuffer: ArrayBuffer,
  details: {
    userName: string;
    department: string;
    sopVersion: string;
    printDate: string;
  }
): Promise<Uint8Array> {
  const { PDFDocument, rgb, degrees, StandardFonts } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  pages.forEach((page) => {
    const { width, height } = page.getSize();
    
    // 1. Diagonal Watermark: "CONTROLLED COPY"
    // Calculate center
    const text = 'CONTROLLED COPY';
    const textSize = 50;
    const textWidth = helveticaFont.widthOfTextAtSize(text, textSize);
    const textHeight = helveticaFont.heightAtSize(textSize);
    
    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size: textSize,
      font: helveticaFont,
      color: rgb(0.95, 0.1, 0.1), // Red
      opacity: 0.2, // Transparent
      rotate: degrees(45),
    });

    // 2. Footer: "Printed by [User] on [Date] | [Dept] | [Version]"
    const footerText = `Printed by: ${details.userName} on ${details.printDate} | Dept: ${details.department} | Ver: ${details.sopVersion}`;
    const footerSize = 10;
    const footerWidth = helveticaFont.widthOfTextAtSize(footerText, footerSize);

    page.drawText(footerText, {
      x: width / 2 - footerWidth / 2,
      y: 20, // 20 units from bottom
      size: footerSize,
      font: helveticaFont,
      color: rgb(0.2, 0.2, 0.2), // Dark Gray
    });
  });

  return await pdfDoc.save();
}
