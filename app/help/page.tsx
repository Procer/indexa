import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/InfoPage";

export const metadata: Metadata = {
  title: "Ayuda y preguntas frecuentes — indexa",
  description: "Cómo usar indexa, de dónde salen los precios y cómo leer el historial y las cuotas.",
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "¿Cómo uso indexa?",
    a: "Contale al asesor qué estás buscando, para qué lo vas a usar y cuánto querés gastar. Te mostramos las mejores opciones y podés seguir afinando la búsqueda en el chat, por ejemplo pidiendo más batería, otra marca o algo más barato.",
  },
  {
    q: "¿indexa vende los productos?",
    a: "No. Te llevamos a la tienda oficial, que es quien te vende, cobra y entrega. Cualquier reclamo por una compra es con la tienda.",
  },
  {
    q: "¿De dónde salen los precios y cada cuánto se actualizan?",
    a: "De los sitios de las tiendas, una vez por día. Si un precio cambió después de esa actualización, vale el que ves en la tienda. Confirmalo siempre antes de pagar.",
  },
  {
    q: "¿Qué significa \"Precio más bajo\" o \"por encima de su precio habitual\"?",
    a: "Compara el precio de hoy con lo que costó ese producto desde que empezamos a seguirlo (hasta 90 días). Un producto recién agregado todavía no tiene historia suficiente y no muestra esa etiqueta.",
  },
  {
    q: "¿Qué es el valor de cuota que aparece?",
    a: "Es el monto de cada cuota mensual informado por la tienda. Fijate en la cantidad de cuotas y si son sin interés: el precio contado es el mejor punto de comparación entre tiendas.",
  },
  {
    q: "¿Qué es \"En otras tiendas\"?",
    a: "Muestra el mismo producto, o modelos parecidos, en el resto de las tiendas que comparamos para que veas si conviene comprarlo en otro lado.",
  },
  {
    q: "¿Qué quiere decir \"Patrocinado\"?",
    a: "Que una marca o tienda pagó para que su producto tenga más visibilidad. Solo aparece si es relevante para lo que buscaste.",
  },
  {
    q: "¿Puedo guardar o compartir mi búsqueda?",
    a: "Sí. Cada búsqueda tiene su propio enlace para compartir, y podés guardarlas con tu email para retomarlas después. Quien tenga el enlace puede ver la búsqueda.",
  },
  {
    q: "El asesor se equivocó o no me entendió, ¿qué hago?",
    a: "Probá reformular con otras palabras. La IA puede equivocarse: confirmá siempre las características en la ficha de la tienda antes de comprar.",
  },
];

export default function HelpPage() {
  return (
    <InfoPage title="Ayuda">
      {FAQ.map((f) => (
        <InfoSection key={f.q} heading={f.q}>
          <p>{f.a}</p>
        </InfoSection>
      ))}
      <p className="text-sm text-gathering-on-surface-variant">
        ¿Seguís con dudas? Mirá cómo funciona nuestro{" "}
        <Link className="font-semibold text-gathering-primary hover:underline" href="/method">método</Link>, las{" "}
        <Link className="font-semibold text-gathering-primary hover:underline" href="/guias">guías de compra</Link> o
        pasá por <Link className="font-semibold text-gathering-primary hover:underline" href="/contact">Contacto</Link>.
      </p>
    </InfoPage>
  );
}
