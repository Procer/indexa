import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage, InfoSection } from "@/components/InfoPage";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contacto — indexa",
  description: "Cómo comunicarte con el equipo de indexa.",
};

export default function ContactPage() {
  return (
    <InfoPage title="Contacto">
      <InfoSection heading="Escribinos">
        {CONTACT_EMAIL ? (
          <p>
            Para consultas, sugerencias, errores en un precio o pedidos sobre tus datos:{" "}
            <a className="font-semibold text-gathering-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
              {CONTACT_EMAIL}
            </a>
          </p>
        ) : (
          <p>
            Todavía estamos habilitando el canal de contacto directo. Mientras tanto, la mayoría de las dudas se
            resuelven en <Link className="font-semibold text-gathering-primary hover:underline" href="/help">Ayuda</Link>{" "}
            o preguntándole al asesor en el chat.
          </p>
        )}
      </InfoSection>

      <InfoSection heading="Antes de escribir">
        <p>
          Si el problema es con una compra (entrega, garantía, factura, devolución), tenés que reclamarle a la tienda:
          indexa no vende ni entrega productos. Si encontraste un precio distinto al que figura acá, es porque la
          tienda lo cambió después de nuestra última actualización diaria.
        </p>
      </InfoSection>
    </InfoPage>
  );
}
