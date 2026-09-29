import type { Metadata } from "next";
import { InfoList, InfoPage, InfoSection } from "@/components/InfoPage";
import { CONTACT_EMAIL, LEGAL_LAST_UPDATE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Política de privacidad — indexa",
  description: "Qué datos guarda indexa cuando lo usás, para qué los usamos y cómo pedir que los borremos.",
};

export default function PrivacyPage() {
  return (
    <InfoPage title="Política de privacidad" updated={LEGAL_LAST_UPDATE}>
      <p>
        indexa es un buscador de tecnología para Argentina. Acá te contamos, sin vueltas, qué información guardamos
        cuando lo usás y para qué. No hace falta crear una cuenta para buscar.
      </p>

      <InfoSection heading="Qué datos guardamos">
        <InfoList
          items={[
            "Lo que escribís: tus búsquedas y los mensajes del chat con el asesor, junto con las respuestas que recibís.",
            "Cómo usás el sitio: qué productos abrís, comparás o tocás para ir a la tienda, cuánto tiempo estás en una página y los errores que pudieran ocurrir en tu navegador.",
            "Un identificador de visita anónimo, guardado en el almacenamiento local de tu navegador (no usamos cookies para esto). Sirve para unir tus búsquedas, clics y mensajes dentro de una misma visita, que termina tras 30 minutos sin actividad.",
            "Tu nombre, solo si decidís cargarlo cuando te lo pedimos (es opcional).",
            "Tu email, solo si elegís guardar o sincronizar tus búsquedas, o si iniciás sesión.",
          ]}
        />
        <p>No te pedimos datos de pago: nunca compramos ni cobramos nada, la compra siempre es en la tienda.</p>
      </InfoSection>

      <InfoSection heading="Para qué los usamos">
        <InfoList
          items={[
            "Entender lo que buscás y devolverte resultados y recomendaciones.",
            "Mejorar el buscador y el asesor: ver qué preguntas no se entienden, qué resultados no sirven y dónde falla el sitio.",
            "Medir qué productos y tiendas resultan útiles, de forma agregada.",
            "Enviarte tus búsquedas guardadas si lo pediste.",
          ]}
        />
        <p>No vendemos tus datos ni los usamos para mostrarte publicidad de terceros.</p>
      </InfoSection>

      <InfoSection heading="Con quién los compartimos">
        <InfoList
          items={[
            "OpenAI: el texto de tus búsquedas y del chat se envía a su servicio para interpretarlo y generar las respuestas. No incluyas datos personales en el chat.",
            "Las tiendas: cuando tocás un producto salís de indexa hacia el sitio de la tienda, que aplica su propia política de privacidad. Algunos enlaces pueden ser de afiliados: si comprás, la tienda puede pagarnos una comisión sin costo extra para vos.",
            "Servicios de acceso: si iniciás sesión, la autenticación la maneja un proveedor externo (Supabase, con enlace por email o Google).",
          ]}
        />
        <p>
          Guardamos la información en nuestro propio servidor, con copias de seguridad diarias. El enlace de una
          búsqueda compartida lo puede abrir cualquiera que lo tenga: compartilo solo con quien quieras.
        </p>
      </InfoSection>

      <InfoSection heading="Tus derechos">
        <p>
          Según la Ley 25.326 de Protección de Datos Personales, podés pedir acceder a tus datos, corregirlos o que los
          eliminemos. Para hacerlo, escribinos indicando tu identificador de visita o el email que usaste.
        </p>
        <p>
          {CONTACT_EMAIL ? (
            <>
              Contacto: <a className="font-semibold text-gathering-primary hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </>
          ) : (
            <>
              Estamos definiendo el canal de contacto; mientras tanto podés ver la página{" "}
              <a className="font-semibold text-gathering-primary hover:underline" href="./contact">Contacto</a>.
            </>
          )}
        </p>
        <p>
          También podés borrar el identificador anónimo en cualquier momento limpiando los datos del sitio en tu
          navegador. La Agencia de Acceso a la Información Pública es el órgano de control de la ley y atiende
          denuncias por incumplimientos.
        </p>
      </InfoSection>

      <InfoSection heading="Cambios">
        <p>Si cambiamos algo relevante de esta política, actualizamos la fecha de arriba.</p>
      </InfoSection>
    </InfoPage>
  );
}
