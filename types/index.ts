// ─── Enums / Union types ──────────────────────────────────────────────────────

export type ProductCategory = "notebook" | "desktop" | "tablet" | "tv" | "phone";

export type ProductSource = "mercadolibre" | "fravega" | "garbarino" | "cetrogar" | "musimundo" | "compumundo" | "megatone" | "coppel" | "naldo" | "jumbo" | "carrefour" | "oncity" | "disco" | "vea" | "changomas" | "pardo";

export type StorageType = "HDD" | "SSD_SATA" | "SSD_NVME";

export type ProcessorTier = "low" | "mid" | "high" | "enthusiast";

export type GpuType = "integrated" | "dedicated";

export type ScreenType = "TN" | "IPS" | "OLED" | "VA";

export type PhoneChipBrand = "Snapdragon" | "Dimensity" | "Apple A" | "Exynos" | "Tensor";
export type PhoneScreenType = "AMOLED" | "IPS" | "LTPO";

export type TvPanelType = "OLED" | "QLED" | "LED" | "NanoCell" | "MiniLED";
export type SmartOsType = "webOS" | "Tizen" | "Google TV" | "Android TV" | "none";
export type TvResolution = "HD" | "FHD" | "4K" | "8K";

export type QualityPriceScore = "EXCELENTE" | "MUY BUENO" | "BUENO" | "REGULAR";

export type UseCase =
  | "casual_browsing"
  | "office"
  | "study"
  | "multimedia"
  | "photo_editing_light"
  | "photo_editing_pro"
  | "video_editing_1080"
  | "video_editing_4k"
  | "programming"
  | "gaming_casual"
  | "gaming_competitive"
  | "graphic_design"
  | "cad_3d"
  | "portability"
  | "stationary"
  | "photography"
  | "battery_life"
  | "gaming_mobile"
  | "basic_use"
  | "social_media"
  | "professional_mobile";

export type OSPreference = "windows" | "macos" | "chromeos" | "any";

export type PortabilityPreference = "light" | "any" | "not_important";

export type ScreenSizePreference = "small" | "medium" | "large" | "any";

// ─── Specs ────────────────────────────────────────────────────────────────────

export interface NotebookSpecs {
  processor_brand: "AMD" | "Intel" | "Apple";
  processor_model: string;
  processor_tier: ProcessorTier;
  ram_gb: number;
  ram_upgradeable: boolean;
  storage_gb: number;
  storage_type: StorageType;
  storage_upgradeable: boolean;
  gpu: GpuType;
  gpu_model: string | null;
  screen_inches: number;
  screen_resolution: string;
  screen_type: ScreenType;
  has_numeric_keyboard: boolean;
  weight_kg: number;
  battery_wh: number;
  os: string;
  ports: string[];
  connectivity: string[];
}

export type DesktopSpecs = Omit<
  NotebookSpecs,
  "weight_kg" | "battery_wh" | "has_numeric_keyboard"
>;

export interface TabletSpecs {
  processor_model: string;
  processor_tier: ProcessorTier;
  ram_gb: number;
  storage_gb: number;
  storage_upgradeable: boolean;
  screen_inches: number;
  screen_resolution: string;
  has_cellular: boolean;
  os: string;
  stylus_compatible: boolean;
}

export interface TvSpecs {
  panel_type: TvPanelType;
  screen_inches: number;
  resolution: TvResolution;
  refresh_rate_hz: 60 | 120 | 144;
  hdr_support: boolean;
  smart_os: SmartOsType;
  ports: string[];
  connectivity: string[];
}

export interface PhoneSpecs {
  processor_chip: PhoneChipBrand;
  processor_model: string;
  ram_gb: number;
  storage_gb: number;
  main_camera_mp: number;
  battery_mah: number;
  screen_inches: number;
  screen_type: PhoneScreenType;
  refresh_rate_hz: 60 | 90 | 120 | 144;
  nfc: boolean;
  has_5g: boolean;
  os: "Android" | "iOS";
  connectivity: string[];
}

export type ProductSpecs = NotebookSpecs | DesktopSpecs | TabletSpecs | TvSpecs | PhoneSpecs;

export interface Upgradeable {
  ram: boolean;
  storage: boolean;
  processor: boolean;
  screen: boolean;
  gpu?: boolean;
}

// ─── Product ──────────────────────────────────────────────────────────────────

export interface ProductStoreVariant {
  source: ProductSource;
  price_cash: number | null;
  price_installment: number | null;
  installment_count: number | null;
  url: string;
  affiliate_url: string | null;
}

// Misma línea/modelo en otra tienda pero con una diferencia menor de specs
// (ej. 256GB vs 512GB, "Pro" vs "Pro+"). Se muestra en un bloque aparte del de
// coincidencia exacta — ver app/api/products/[id]/other-stores/route.ts.
export interface SimilarStoreVariant extends ProductStoreVariant {
  id: string;
  title: string;
  differences: string[];
}

export interface Product {
  id: string;
  external_id: string;
  source: ProductSource;
  url: string;
  affiliate_url: string | null;
  category: ProductCategory;
  brand: string | null;
  model: string | null;
  title: string;
  specs: ProductSpecs;
  upgradeable: Upgradeable;
  price_cash: number | null;
  price_installment: number | null;
  installment_count: number | null;
  installment_info: string | null;
  currency: string;
  image_url: string | null;
  images: string[];
  quality_price_score: QualityPriceScore | null;
  quality_price_analysis: string | null;
  analysis_generated_at: string | null;
  available: boolean;
  stock: number | null;
  click_count: number;
  is_sponsored: boolean;
  sponsor_score_boost: number;
  scraped_at: string;
  updated_at: string;
  created_at: string;
  // Mismo producto detectado en otras tiendas (mismo buildDedupeKey), ordenado por precio
  // ascendente. Solo se calcula en la búsqueda en vivo (app/api/search/route.ts) — en cache
  // hits del caché estructurado queda undefined, ver nota ahí.
  also_at?: ProductStoreVariant[];
}

export interface ProductAnalysis {
  quality_price_score: QualityPriceScore;
  quality_price_analysis: string;
  selection_reason: string;
  spec_highlights: string[];
  spec_highlights_simple: string[];
  upgrade_note: string | null;
}

export interface ProductSearchResult {
  id: string;
  similarity: number;
  is_sponsored: boolean;
  click_count: number;
}

export interface ScoredProduct extends ProductSearchResult {
  final_score: number;
}

export interface EnrichedProduct extends Product {
  similarity: number;
  final_score: number;
  selection_reason: string;
  spec_highlights: string[];
  spec_highlights_simple: string[];
  upgrade_note: string | null;
  analysis_from_cache: boolean;
  // Jugada #15: veredicto de precio de una línea vs. la mediana de la misma
  // configuración (marca + RAM + almacenamiento) en el pool. Determinístico,
  // sin LLM. null cuando no hay muestra suficiente para comparar.
  price_verdict?: string | null;
  // Solo se setea cuando el producto matchea una marca pedida
  // (preferences.brands_preferred) pero su precio queda fuera del rango
  // declarado — se muestra igual (transparencia) en vez de ocultarlo o dejar
  // que el chat diga "no encontré ninguna" cuando en realidad sí existe, solo
  // que no entra en el presupuesto (bug reportado en vivo).
  out_of_budget?: "above" | "below" | null;
}

// ─── Search / Slots ───────────────────────────────────────────────────────────

export interface SlotPreferences {
  os: OSPreference;
  brands_preferred: string[];
  brands_excluded: string[];
  portability: PortabilityPreference;
  screen_size: ScreenSizePreference;
  // Modelo/línea de procesador puntual mencionado explícitamente (ej. "i7",
  // "Ryzen 5") — preferencia blanda como brands_preferred: prioriza y habilita
  // transparencia de fuera-de-presupuesto, no filtra duro. Null si el usuario
  // no nombró un modelo específico (no se infiere de use_cases).
  processor_model_preferred: string | null;
}

export interface TechnicalFilters {
  min_ram_gb: number | null;
  storage_type: StorageType | null;
  gpu_required: boolean;
}

export interface PhoneTechnicalFilters {
  min_ram_gb: number | null;
  min_storage_gb: number | null;
  min_camera_mp: number | null;
  require_5g: boolean;
  require_nfc: boolean;
  os: "Android" | "iOS" | null;
}

export interface Slots {
  category: ProductCategory | null;
  use_cases: UseCase[];
  budget_monthly_ars: number | null;
  budget_cash_ars: number | null;
  // Piso opcional del rango de presupuesto al contado (ej. "entre 900 mil y
  // 1,6 millones de pesos") — budget_cash_ars sigue siendo el techo. Null
  // cuando el usuario solo dio un tope ("hasta $X"), el caso más común.
  budget_cash_min_ars: number | null;
  budget_installment_count: number | null;
  preferences: SlotPreferences;
  excluded_product_ids: string[];
  technical_filters: TechnicalFilters;
  phone_filters: PhoneTechnicalFilters;
  is_ambiguous: boolean;
  missing_info: Array<"category" | "use_case" | "budget" | "budget_type">;
}

export interface Search {
  id: string;
  raw_input: string;
  slots: Slots;
  expanded_query: string | null;
  result_ids: string[];
  share_token: string;
  user_id: string | null;
  session_id: string | null;
  result_count: number;
  created_at: string;
}

// ─── Admin analytics ────────────────────────────────────────────────────────

export interface SearchAnalyticsDay {
  date: string;
  count: number;
}

export interface SearchAnalyticsCategory {
  category: string;
  count: number;
}

export interface SearchAnalyticsProduct {
  product_id: string;
  title: string;
  category: ProductCategory | null;
  clicks: number;
  click_count: number;
}

export interface SearchAnalyticsUseCase {
  use_case: string;
  count: number;
}

export interface SearchAnalyticsBrand {
  brand: string;
  count: number;
}

export interface SearchAnalyticsStore {
  store: string;
  count: number;
}

export interface SearchAnalyticsMonth {
  month: string; // "2026-09"
  count: number;
}

export interface SearchAnalyticsDow {
  dow: string; // "Mon".."Sun"
  label: string; // "Lunes".."Domingo"
  count: number;
}

export interface SearchAnalytics {
  days: number;
  totalSearches: number;
  noResultRate: number;
  fewResultRate: number;
  conversionRate: number;
  totalClicks: number;
  // Jugada #17: clicks en "Comprar" cruzados con si el equipo fue recomendado
  // (topPick del chat). Mide la conversión real "recomendado → comprado", no
  // solo el conteo de clicks. buyClicks = eventos product_buy_click en la
  // ventana; recommendedBuyShare = fracción de esos que eran de un recomendado.
  buyClicks: number;
  recommendedBuyClicks: number;
  recommendedBuyShare: number;
  byDay: SearchAnalyticsDay[];
  byCategory: SearchAnalyticsCategory[];
  // Uso/marca/tienda más buscados — misma ventana que el picker (days).
  byUseCase: SearchAnalyticsUseCase[];
  byBrand: SearchAnalyticsBrand[];
  byStore: SearchAnalyticsStore[];
  // Patrones de mes/día de semana — ventana fija (año calendario en curso),
  // independiente del picker: con 7/30 días no hay suficientes repeticiones
  // para ver un patrón semanal o estacional real.
  byMonth: SearchAnalyticsMonth[];
  byDayOfWeek: SearchAnalyticsDow[];
  topProducts: SearchAnalyticsProduct[];
}

// ─── UI ───────────────────────────────────────────────────────────────────────

export interface GuidingQuestion {
  text: string;
  tags: string[];
}

export interface CompareItem {
  product: Product;
  analysis: ProductAnalysis | null;
}

// ─── Sponsored ────────────────────────────────────────────────────────────────

export interface SponsoredPlacement {
  id: string;
  advertiser: string;
  product_ids: string[];
  categories: ProductCategory[];
  score_boost: number;
  min_relevance: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export type SearchResponse =
  | {
      type: "needs_info";
      questions: GuidingQuestion[];
      slots: Slots;
    }
  | {
      type: "results";
      products: EnrichedProduct[];
      inline_questions: GuidingQuestion[];
      total_count: number;
      share_token: string;
      search_id: string;
      from_cache: boolean;
      slots: Slots;
    };

// ─── Cache ────────────────────────────────────────────────────────────────────

export interface CacheHit {
  search_id: string;
  result_ids: string[];
}

export interface SQLFilters {
  category: ProductCategory | null;
  max_price_cash: number | null;
  max_price_installment: number | null;
  require_gpu: boolean;
  min_ram_gb: number | null;
  require_ssd: boolean;
  brands_excluded: string[];
  max_weight_kg: number | null;
}

// ─── Price History ────────────────────────────────────────────────────────────

export interface PriceHistoryPoint {
  price_cash: number | null;
  price_installment: number | null;
  recorded_at: string;
}

// ─── Price Alerts ─────────────────────────────────────────────────────────────

export interface PriceAlert {
  id: string;
  user_id: string | null;
  email: string | null;
  manage_token: string;
  product_id: string;
  target_price: number;
  is_active: boolean;
  last_notified_at: string | null;
  created_at: string;
}

export interface PriceAlertWithProduct extends PriceAlert {
  product: Pick<Product, "id" | "title" | "image_url" | "price_cash" | "url">;
}

// ─── LocalStorage ─────────────────────────────────────────────────────────────

export interface SavedSearch {
  search_id: string;
  share_token: string;
  raw_input: string;
  saved_at: string;
}

export interface RecentProduct {
  id: string;
  title: string;
  category: ProductCategory;
  price_cash: number | null;
  viewed_at: string;
}

// Búsqueda resuelta desde la DB para listar en /mis-busquedas/[token] — subset
// de Search (lib/db/queries.ts) con solo lo necesario para la tarjeta.
export interface SavedSearchListItem {
  share_token: string;
  raw_input: string;
  result_count: number;
  created_at: string;
}

// ─── Chat del comparador ──────────────────────────────────────────────────────

// Una opción dentro del selector de variantes de una tarjeta (ver
// AlternativeProduct.variants / lib/domain/variantGroup.ts).
export interface VariantOption {
  id: string;
  // Etiqueta corta de lo que la distingue: "512GB", "Gris", "con datos",
  // "512GB · Negro". "otra versión" si no se pudo caracterizar.
  label: string;
  price_cash: number | null;
  price_installment: number | null;
  installment_count: number | null;
  url: string;
  affiliate_url: string | null;
  source: ProductSource;
  isPrimary: boolean;
}

export interface AlternativeProduct {
  id: string;
  title: string;
  brand: string | null;
  model: string | null;
  category: ProductCategory;
  price_cash: number | null;
  price_installment: number | null;
  image_url: string | null;
  source: ProductSource;
  url: string;
  affiliate_url: string | null;
  // Opcionales: solo el chat de resultados (refine-chat) los llena hoy, a partir
  // de EnrichedProduct — el chat del comparador (quickAlternative.ts) sigue sin
  // pasarlos, la UI los trata como ausentes sin romper nada.
  installment_count?: number | null;
  quality_price_score?: QualityPriceScore | null;
  spec_highlights?: string[];
  spec_highlights_simple?: string[];
  // Specs crudas del producto — para mostrar el dato concreto ("i3", "8GB",
  // "256GB SSD") junto al veredicto llano en la tarjeta, y para el resumen
  // que arma la función de compartir selección. La llenan los conversores
  // que parten de un EnrichedProduct/Product completo.
  specs?: ProductSpecs;
  // Casi-duplicados (misma línea/modelo, diferencia menor: color / SO / 256↔512GB)
  // colapsados en esta tarjeta con un selector. Lo arma groupVariants() del lado
  // del cliente sobre la grilla de resultados; incluye una entrada para el
  // producto primario. Al elegir una variante cambian precio y link de compra;
  // las specs mostradas siguen siendo las del primario.
  variants?: VariantOption[];
  // Nota determinística de "qué se puede cambiar a futuro" (getUpgradeNote:
  // category + specs + upgradeable) — no la nota del LLM de EnrichedProduct,
  // que casi siempre viene null. La llenan los conversores que parten de un
  // EnrichedProduct/Product completo.
  upgrade_note?: string | null;
  out_of_budget?: "above" | "below" | null;
  // Mismo producto detectado en otras tiendas — ver Product.also_at. Solo lo
  // llenan los conversores que parten de un EnrichedProduct ya dedupeado.
  also_at?: ProductStoreVariant[];
  // Jugada #15: veredicto de precio vs. mediana de la config (ver EnrichedProduct).
  price_verdict?: string | null;
}
