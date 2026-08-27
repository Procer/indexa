import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/db/supabase";
import type { PriceAlertWithProduct } from "@/types";

// GET /api/alerts/manage/[token] — alertas activas asociadas a un manage_token (sin login)
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { data, error } = await supabase
    .from("price_alerts")
    .select(`
      id, product_id, target_price, is_active, last_notified_at, created_at, manage_token,
      product:products(id, title, image_url, price_cash, url)
    `)
    .eq("manage_token", params.token)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data as unknown as PriceAlertWithProduct[] });
}
