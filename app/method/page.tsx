import type { Metadata } from "next";
import { InfoList, InfoPage, InfoSection } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Cómo funciona indexa (metodología) — indexa",
  description: "Cómo interpretamos lo que buscás, cómo ordenamos los resultados y qué parte hace la inteligencia artificial.",
};

export default function MethodPage() {
  return (
    <InfoPage title="Cómo funciona indexa">
      <InfoSection heading="1. Entendemos lo que necesitás">
        <p>
          Cuando describís qué buscás, un modelo de lenguaje (OpenAI GPT-4o mini) traduce tu pedido a datos concretos:
          tipo de equipo, uso, presupuesto y preferencias. Si falta algo importante, el asesor te lo pregunta.
        </p>
      </InfoSection>

      <InfoSection heading="2. Buscamos entre productos reales">
        <p>
          Revisamos el catálogo de las tiendas que comparamos, que se actualiza una vez por día. La búsqueda combina
          filtros de precio y características con una búsqueda por significado, así encuentra productos aunque no uses las
          palabras exactas del título.
        </p>
      </InfoSection>

      <InfoSection heading="3. Ordenamos según tu uso">
        <p>
          Cada uso (trabajar, estudiar, jugar, editar) requiere características distintas; las traducimos a criterios
          técnicos y ordenamos según cuánto se ajusta cada producto y su relación calidad/precio.
        </p>
      </InfoSection>

      <InfoSection heading="4. Qué hace la IA y qué no">
        <InfoList
          items={[
            "La IA interpreta tu pedido, redacta las explicaciones y el análisis de calidad/precio de cada producto.",
            "Las cuentas —cuál tiene más RAM, cuál es más barato, cuál es más liviano— se calculan con los datos, no las inventa la IA.",
            "El análisis de un producto se genera una vez por producto y se guarda; no cambia según quién pregunte.",
            "La IA puede equivocarse: confirmá las características en la ficha de la tienda antes de comprar.",
          ]}
        />
      </InfoSection>

      <InfoSection heading="5. Publicidad y transparencia">
        <p>
          Los resultados patrocinados se marcan como tales y solo aparecen si superan un mínimo de relevancia para tu
          búsqueda. Algunos enlaces a tiendas pueden generar una comisión sin costo
          extra para vos. No vendemos tus datos.
        </p>
      </InfoSection>

      <InfoSection heading="6. Historial de precios">
        <p>
          Registramos el precio de cada producto cada vez que cambia. Con eso te mostramos si hoy está en su precio más
          bajo, en su precio habitual o por encima, usando un promedio ponderado por el tiempo que estuvo a cada precio.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
