# 🚗 CARVLAK | Tasador Rápido de Vehículos (Vercel Edition)

Sistema de tasación rápida de vehículos para **Jonathan Kaitazoff, Maximiliano Irujo, Marcos Martínez y Bruno Di Giovanni**, conectado con las **716 respuestas reales** del anuncio de Instagram.

Diseñado con la misma arquitectura moderna y desacoplada de la **aplicación de detailing**, optimizado para usarse indistintamente en **iPhones (Safari / PWA)** y en la **Computadora (PC / Mac)**.

---

## 🚀 Cómo Subir a Vercel en 10 Segundos (100% Gratis)

1. Entrá a tu cuenta de [Vercel.com](https://vercel.com) (o [app.netlify.com/drop](https://app.netlify.com/drop)).
2. Hacé clic en **Add New...** > **Project**.
3. Arrastrá la carpeta `carvlak-tasador-vercel` (o el archivo `carvlak-tasador-vercel.zip`).
4. Hacé clic en **Deploy**.
5. ¡Listo! Te dará un enlace permanente como:
   👉 `https://carvlak-tasador.vercel.app`

---

## 📱 Cómo Instalarla en tu iPhone

1. Abrí el enlace de Vercel en el **Safari** de tu iPhone.
2. Tocá el botón **Compartir** (el cuadradito con la flecha hacia arriba `⬆️`).
3. Seleccioná **"Agregar a pantalla de inicio"**.
4. ¡Listo! Te queda el icono oficial de CARVLAK en la pantalla principal de tu iPhone y se abre en **pantalla completa** sin barras de navegación, exactamente igual a una app nativa.

---

## 👥 Selector de Operador & Firma Dinámica de WhatsApp

En la barra superior podés alternar en 1 clic quién está cotizando:
- **Jonathan Kaitazoff**
- **Maximiliano Irujo**
- **Marcos Martínez**
- **Bruno Di Giovanni**

La app recuerda automáticamente quién está trabajando (se guarda en tu teléfono o PC) y **redacta los 4 mensajes de WhatsApp con la firma y el saludo de la persona seleccionada**.

---

## ⚡ Flujo de Tasación Rápida

1. **Orden de Llegada (Hoy primero):** Los clientes que completaron el formulario hoy aparecen en el primer lugar de la fila.
2. **Pestaña Pendientes:** Abrís la pestaña `⏳ Pendientes (400)` para ir liquidando uno a uno.
3. **El Conjunto de Tags:** Detecta automáticamente detalles de chapa y pintura, service oficial, cubiertas, aire acondicionado o fallas mecánicas.
4. **Botón `[🚀 Tasar y WhatsApp]`:** Guarda el monto en el sistema y abre WhatsApp con el mensaje ya generado para enviar con 1 toque.

---

## 🔄 Conexión en Vivo con Google Sheets (Opcional)

La app viene pre-cargada con los 716 leads reales de tu planilla. Si además querés que cada tasación se guarde en vivo directamente en tu Google Sheet:
1. En tu Google Sheet, andá a **Extensiones** > **Apps Script**.
2. Pegá el código del archivo `google-sheets-bridge.js`.
3. Clic en **Implementar** > **Nueva implementación** > Tipo: **Aplicación web**.
4. En acceso elegí: **"Cualquier persona"** y copiá el enlace.
5. En la app de Vercel, tocá el botón **`🔄 Google Sheets`** arriba a la derecha y pegá el enlace. ¡Quedará conectada en tiempo real!

---

## 💻 Abrir Localmente en tu PC sin Internet

Hacé doble clic en el archivo **`iniciar.bat`** (o abrí `index.html` con Chrome o Edge).
