import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'lote.geojson');
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const geojson = JSON.parse(fileContent);
    return NextResponse.json(geojson);
  } catch {
    return NextResponse.json({ error: 'Failed to load geojson' }, { status: 500 });
  }
}
