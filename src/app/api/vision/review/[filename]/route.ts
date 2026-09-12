import { NextRequest, NextResponse } from 'next/server';
import { visionBackendUrl, visionBackendHeaders } from '@/lib/visionBackend';

export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const resolvedParams = await params;
  const filename = resolvedParams.filename;

  if (!/^[a-fA-F0-9]+\.png$/.test(filename)) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
  }

  const backendUrl = visionBackendUrl();
  if (!backendUrl) {
    return NextResponse.json({ error: 'Backend not configured' }, { status: 404 });
  }

  try {
    const res = await fetch(`${backendUrl}/api/vision/review/${filename}`, {
      headers: visionBackendHeaders(),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Not found on backend' }, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    });
  } catch {
    return NextResponse.json({ error: 'Error proxying image' }, { status: 502 });
  }
}
