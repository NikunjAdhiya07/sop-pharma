import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Read file content
    const text = await file.text();
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);

    if (lines.length < 2) {
      return NextResponse.json(
        { success: false, error: 'CSV file is empty or invalid' },
        { status: 400 }
      );
    }

    // Parse header
    const header = lines[0].split(',').map(h => h.trim());
    
    // Expected columns
    const expectedColumns = ['SOP Identifier', 'Effective Date', 'Review Date', 'Expiry Date', 'Version', 'Owner'];
    
    // Validate header
    if (!header.includes('SOP Identifier')) {
      return NextResponse.json(
        { success: false, error: 'CSV must contain "SOP Identifier" column' },
        { status: 400 }
      );
    }

    let updatedCount = 0;
    const errors: any[] = [];

    // Process each row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const values = line.split(',').map(v => v.trim());
      
      try {
        // Create object from row
        const rowData: any = {};
        header.forEach((col, idx) => {
          rowData[col] = values[idx] || '';
        });

        const identifier = rowData['SOP Identifier'];
        
        if (!identifier) {
          errors.push({ row: i + 1, error: 'Missing SOP Identifier' });
          continue;
        }

        // Find SOP by identifier
        const sop = await SOP.findOne({ identifier });
        
        if (!sop) {
          errors.push({ row: i + 1, error: `SOP not found: ${identifier}` });
          continue;
        }

        // Prepare update fields
        const updateFields: any = {};

        if (rowData['Effective Date']) {
          const date = new Date(rowData['Effective Date']);
          if (!isNaN(date.getTime())) {
            updateFields.effectiveDate = date;
          } else {
            errors.push({ row: i + 1, error: `Invalid Effective Date format: ${rowData['Effective Date']}` });
            continue;
          }
        }

        if (rowData['Review Date']) {
          const date = new Date(rowData['Review Date']);
          if (!isNaN(date.getTime())) {
            updateFields.reviewDate = date;
          } else {
            errors.push({ row: i + 1, error: `Invalid Review Date format: ${rowData['Review Date']}` });
            continue;
          }
        }

        if (rowData['Expiry Date']) {
          const date = new Date(rowData['Expiry Date']);
          if (!isNaN(date.getTime())) {
            updateFields.expiryDate = date;
          } else {
            errors.push({ row: i + 1, error: `Invalid Expiry Date format: ${rowData['Expiry Date']}` });
            continue;
          }
        }

        if (rowData['Version']) {
          updateFields.version = rowData['Version'];
        }

        if (rowData['Owner']) {
          updateFields.owner = rowData['Owner'];
        }

        // Update SOP
        if (Object.keys(updateFields).length > 0) {
          await SOP.updateOne({ _id: sop._id }, { $set: updateFields });
          updatedCount++;
        }

      } catch (error) {
        errors.push({
          row: i + 1,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      totalRows: lines.length - 1,
      updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error) {
    console.error('CSV import error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'CSV import failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
