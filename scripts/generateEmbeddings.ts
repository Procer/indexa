import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
import OpenAI from "openai";
import type {
  Product,
  NotebookSpecs,
  DesktopSpecs,
  PhoneSpecs,
  TabletSpecs,
  TvSpecs,
} from "@/types";

// Node 20 no trae WebSocket nativo (recién en Node 22); supabase-js igual
// instancia un RealtimeClient al crear el cliente aunque este script nunca
// use realtime, así que sin esto tira "Node.js 20 detected without native
// WebSocket support" apenas se llama a createClient.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { realtime: { transport: ws as unknown as WebSocketLikeConstructor } }
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const BATCH_SIZE = 20;
const forceRegenerate = process.argv.includes("regenerate-all");

// ─── Etiqueta de gama según precio y categoría ───────────────────────────────

function gamaLabel(product: Product): string {
  const price = product.price_cash;
  if (!price) return "";
  if (product.category === "notebook" || product.category === "desktop") {
    if (price < 400_000) return "gama entrada económica bajo presupuesto";
    if (price < 800_000) return "gama media buena relación calidad precio";
    if (price < 1_500_000) return "gama alta premium";
    return "gama muy alta tope de gama enthusiast";
  }
  if (product.category === "phone") {
    if (price < 180_000) return "gama baja económico entrada";
    if (price < 450_000) return "gama media relación calidad precio";
    return "gama alta flagship premium";
  }
  if (product.category === "tablet") {
    if (price < 200_000) return "tablet económica gama entrada";
    if (price < 500_000) return "tablet gama media";
    return "tablet gama alta premium";
  }
  return "";
}

// ─── Texto descriptivo por categoría ─────────────────────────────────────────

function buildNotebookText(product: Product): string {
  const s = product.specs as NotebookSpecs & DesktopSpecs;
  const parts: string[] = [];

  const tipo = product.category === "notebook" ? "Notebook" : "PC de escritorio";
  parts.push(`${tipo} ${product.brand ?? ""} ${product.model ?? ""}`);
  parts.push(product.title);
  parts.push(`Procesador ${s.processor_brand} ${s.processor_model} categoría ${s.processor_tier}`);
  parts.push(`${s.ram_gb}GB RAM${s.ram_upgradeable ? " ampliable" : ""}`);
  parts.push(
    `${s.storage_gb}GB ${
      s.storage_type === "SSD_NVME"
        ? "SSD NVMe rápido"
        : s.storage_type === "SSD_SATA"
        ? "SSD"
        : "disco HDD"
    }`
  );

  if (s.gpu === "dedicated" && s.gpu_model) {
    parts.push(`Tarjeta de video dedicada ${s.gpu_model}`);
  } else {
    parts.push("GPU integrada sin tarjeta de video dedicada");
  }

  if (product.category === "notebook") {
    const ns = product.specs as NotebookSpecs;
    parts.push(
      `Pantalla ${ns.screen_inches}" ${ns.screen_type} ${ns.screen_resolution}`
    );
    parts.push(
      `Peso ${ns.weight_kg}kg${ns.weight_kg <= 1.5 ? " ultraliviana portátil" : ""}`
    );
    parts.push(`Batería ${ns.battery_wh}Wh`);
    if (ns.has_numeric_keyboard) parts.push("Teclado numérico");
  }

  parts.push(`Sistema operativo ${s.os}`);
  if (product.price_cash) {
    parts.push(
      `Precio ${product.price_cash.toLocaleString("es-AR")} pesos argentinos contado`
    );
  }

  const gama = gamaLabel(product);
  if (gama) parts.push(gama);

  const uses: string[] = [];
  if (s.ram_gb >= 16 && s.storage_type !== "HDD") uses.push("oficina trabajo Word Excel");
  if (s.ram_gb >= 8) uses.push("uso cotidiano navegación internet YouTube redes sociales");
  if (s.ram_gb >= 8) uses.push("estudio educación videoconferencias Zoom");
  if (s.gpu === "dedicated") uses.push("gaming videojuegos juegos");
  if (s.ram_gb >= 16 && s.gpu === "dedicated") uses.push("edición de video editar fotos diseño gráfico");
  if (s.ram_gb >= 32 && s.gpu === "dedicated") uses.push("producción profesional CAD 3D renderizado");
  if (s.ram_gb >= 16 && s.storage_type === "SSD_NVME") uses.push("programación desarrollo software");
  if (product.category === "notebook") {
    const ns = product.specs as NotebookSpecs;
    if (ns.weight_kg <= 1.5) uses.push("portabilidad llevar al trabajo movilidad viaje");
    if (ns.screen_type === "OLED" || ns.screen_type === "IPS") uses.push("multimedia películas series contenido");
  }

  if (uses.length > 0) parts.push(`Ideal para: ${uses.join(", ")}`);

  return parts.join(". ");
}

function buildPhoneText(product: Product): string {
  const s = product.specs as PhoneSpecs;
  const parts: string[] = [];

  parts.push(`Celular smartphone ${product.brand ?? ""} ${product.model ?? ""}`);
  parts.push(product.title);
  parts.push(`Procesador ${s.processor_chip} ${s.processor_model}`);
  parts.push(`${s.ram_gb}GB RAM ${s.storage_gb}GB almacenamiento`);
  parts.push(`Cámara ${s.main_camera_mp}MP`);
  parts.push(`Pantalla ${s.screen_inches}" ${s.screen_type} ${s.refresh_rate_hz}Hz`);
  parts.push(`Batería ${s.battery_mah}mAh`);
  if (s.has_5g) parts.push("5G");
  if (s.nfc) parts.push("NFC pagos sin contacto");
  parts.push(`Sistema operativo ${s.os}`);
  if (product.price_cash) {
    parts.push(
      `Precio ${product.price_cash.toLocaleString("es-AR")} pesos argentinos contado`
    );
  }

  const gama = gamaLabel(product);
  if (gama) parts.push(gama);

  const uses: string[] = ["llamadas mensajes uso básico"];
  if (s.ram_gb >= 6) uses.push("redes sociales Instagram TikTok YouTube");
  if (s.main_camera_mp >= 48) uses.push("fotografía fotos");
  if (s.refresh_rate_hz >= 90) uses.push("gaming juegos móviles");
  if (s.battery_mah >= 5000) uses.push("batería duradera todo el día");
  if (s.has_5g) uses.push("conectividad 5G alta velocidad");
  parts.push(`Ideal para: ${uses.join(", ")}`);

  return parts.join(". ");
}

function buildTabletText(product: Product): string {
  const s = product.specs as TabletSpecs;
  const parts: string[] = [];

  parts.push(`Tablet ${product.brand ?? ""} ${product.model ?? ""}`);
  parts.push(product.title);
  parts.push(`Procesador ${s.processor_model} categoría ${s.processor_tier}`);
  parts.push(`${s.ram_gb}GB RAM ${s.storage_gb}GB almacenamiento`);
  parts.push(`Pantalla ${s.screen_inches}" ${s.screen_resolution}`);
  if (s.has_cellular) parts.push("con SIM 4G conectividad celular");
  if (s.stylus_compatible) parts.push("compatible con lápiz stylus dibujo anotaciones");
  parts.push(`Sistema operativo ${s.os}`);
  if (product.price_cash) {
    parts.push(
      `Precio ${product.price_cash.toLocaleString("es-AR")} pesos argentinos contado`
    );
  }

  const gama = gamaLabel(product);
  if (gama) parts.push(gama);

  const uses: string[] = ["consumo de contenido películas series videos"];
  if (s.stylus_compatible) uses.push("dibujo digital notas manuscritas");
  if (s.ram_gb >= 6) uses.push("productividad trabajo documentos");
  if (s.has_cellular) uses.push("uso fuera de casa conectividad móvil");
  parts.push(`Ideal para: ${uses.join(", ")}`);

  return parts.join(". ");
}

function buildTvText(product: Product): string {
  const s = product.specs as TvSpecs;
  const parts: string[] = [];

  parts.push(`Televisor TV ${product.brand ?? ""} ${product.model ?? ""}`);
  parts.push(product.title);
  parts.push(
    `Pantalla ${s.screen_inches}" ${s.panel_type} ${s.resolution} ${s.refresh_rate_hz}Hz`
  );
  if (s.hdr_support) parts.push("HDR compatible");
  parts.push(`Smart TV ${s.smart_os}`);
  if (product.price_cash) {
    parts.push(
      `Precio ${product.price_cash.toLocaleString("es-AR")} pesos argentinos contado`
    );
  }

  const uses = ["ver películas series streaming Netflix YouTube"];
  if (s.refresh_rate_hz >= 120) uses.push("gaming consola ps5 xbox deportes");
  if (s.resolution === "4K") uses.push("imagen 4K ultra HD alta definición");
  if (s.panel_type === "OLED") uses.push("calidad imagen premium colores perfectos");
  parts.push(`Ideal para: ${uses.join(", ")}`);

  return parts.join(". ");
}

function buildProductText(product: Product): string {
  switch (product.category) {
    case "notebook":
    case "desktop":
      return buildNotebookText(product);
    case "phone":
      return buildPhoneText(product);
    case "tablet":
      return buildTabletText(product);
    case "tv":
      return buildTvText(product);
    default:
      return `${product.title} ${product.brand ?? ""} ${product.model ?? ""}`;
  }
}

// ─── Procesamiento por batches ────────────────────────────────────────────────

async function processBatch(products: Product[]): Promise<void> {
  const texts = products.map(buildProductText);

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts,
  });

  const updates = products.map((product, i) => ({
    id: product.id,
    embedding: response.data[i].embedding,
  }));

  for (const update of updates) {
    const { error } = await supabase
      .from("products")
      .update({ embedding: update.embedding })
      .eq("id", update.id);

    if (error) {
      console.error(`  Error en ${update.id}: ${error.message}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (forceRegenerate) {
    console.log("Modo regenerate-all: regenerando embeddings para TODOS los productos...");
  } else {
    console.log("Buscando productos sin embedding...");
  }

  const baseQuery = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: products, error } = await (
    forceRegenerate ? baseQuery : baseQuery.is("embedding", null)
  );

  if (error) {
    console.error("Error al consultar:", error.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log("No hay productos para procesar.");
    return;
  }

  console.log(
    `${products.length} productos para procesar en batches de ${BATCH_SIZE}`
  );

  const batches: Product[][] = [];
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE) as Product[]);
  }

  for (let i = 0; i < batches.length; i++) {
    process.stdout.write(
      `  Batch ${i + 1}/${batches.length} (${batches[i].length} productos)...`
    );
    await processBatch(batches[i]);
    console.log(" ✓");
  }

  console.log(`\n✓ Embeddings generados para ${products.length} productos`);
}

main();
