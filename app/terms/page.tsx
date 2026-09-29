import type { Metadata } from "next";
import { InfoList, InfoPage, InfoSection } from "@/components/InfoPage";
import { LEGAL_LAST_UPDATE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Términos de uso — indexa",
  description: "Las reglas de uso de indexa: qué hacemos, qué no y cómo tomar las recomendaciones y los precios.",
};

export default function TermsPage() {
  return (
    <InfoPage title="Términos de uso" updated={LEGAL_LAST_UPDATE} icon="gavel" subtitle="Las reglas del sitio, cortas y en castellano simple.">
      <p>Al usar indexa aceptás estas condiciones. Son cortas y en castellano simple.</p>

      <InfoSection heading="Qué es indexa">
        <p>
          Un buscador y asesor de tecnología que reúne productos de tiendas online argentinas y te ayuda a elegir según
          tu uso y presupuesto. <strong>No vendemos productos</strong>: cuando querés comprar, te llevamos a la tienda
          oficial, que es quien te vende, cobra y se ocupa de la entrega, la garantía y la factura.
        </p>
      </InfoSection>

      <InfoSection heading="Precios y disponibilidad">
        <InfoList
          items={[
            "Los precios, cuotas y stock los toma indexa de cada tienda y se actualizan una vez por día. Pueden cambiar en cualquier momento.",
            "El precio y las condiciones válidos son siempre los que ves en el sitio de la tienda al momento de comprar. Verificá antes de pagar.",
            "El historial de precios refleja lo que registramos desde que empezamos a seguir cada producto; no incluye datos anteriores.",
            "Las cuotas que mostramos son las informadas por la tienda; algunas pueden tener interés o requerir un medio de pago específico.",
          ]}
        />
      </InfoSection>

      <InfoSection heading="Recomendaciones e inteligencia artificial">
        <p>
          Las recomendaciones y los análisis se generan con ayuda de inteligencia artificial y reglas propias. Pueden
          contener errores u omisiones y no reemplazan tu criterio ni el consejo de un profesional. Antes de comprar,
          confirmá las características en la ficha de la tienda. Ver también{" "}
          <a className="font-semibold text-gathering-primary hover:underline" href="./method">cómo funciona nuestro método</a>.
        </p>
      </InfoSection>

      <InfoSection heading="Publicidad y comisiones">
        <p>
          Algunos resultados pueden estar patrocinados y se marcan como tales; solo aparecen si son relevantes para lo
          que buscaste. Algunos enlaces pueden generar una comisión para indexa si comprás, sin costo adicional para vos.
        </p>
      </InfoSection>

      <InfoSection heading="Uso del sitio">
        <InfoList
          items={[
            "Podés usarlo libremente para tu consulta personal.",
            "No está permitido extraer contenido de forma automatizada, sobrecargar el servicio ni intentar acceder a áreas restringidas.",
            "Podemos limitar el uso si detectamos abuso.",
          ]}
        />
      </InfoSection>

      <InfoSection heading="Marcas y contenido de terceros">
        <p>
          Los nombres, marcas, imágenes y descripciones de productos pertenecen a sus respectivos titulares y a las
          tiendas de origen. indexa no está afiliado a las marcas ni a las tiendas que muestra.
        </p>
      </InfoSection>

      <InfoSection heading="Responsabilidad">
        <p>
          Hacemos lo posible por mantener la información correcta, pero el servicio se ofrece tal como está. No somos
          responsables por diferencias de precio o stock, por decisiones de compra tomadas en base al contenido ni por
          lo que ocurra en los sitios de las tiendas.
        </p>
      </InfoSection>

      <InfoSection heading="Ley aplicable y cambios">
        <p>
          Estas condiciones se rigen por las leyes de la República Argentina. Podemos modificarlas; la fecha de arriba
          indica la última versión.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
