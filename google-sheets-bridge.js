/**
 * ==============================================================================
 * CARVLAK - PUENTE DE SINCRONIZACIÓN GOOGLE SHEETS PARA VERCEL
 * ==============================================================================
 * Si querés conectar tu app en Vercel directamente con tu Google Sheet:
 * 1. En tu Google Sheet, andá a Extensiones > Apps Script.
 * 2. Pegá este código y guardalo (Ctrl + S).
 * 3. Clic en "Implementar" > "Nueva implementación" > Tipo: "Aplicación web".
 * 4. Configuración obligatoria:
 *    - Ejecutar como: "Yo" (tu cuenta de Google).
 *    - Quién tiene acceso: "Cualquier persona" (para que Vercel pueda leer y guardar).
 * 5. Copiá la URL resultante y pegala en el botón "🔄 Google Sheets" de tu app de Vercel.
 */

var SPREADSHEET_ID = '1pomsp0u3fEhCz1syDz9HtOT5VrneOZT2JYBDgK2qv-I';
var SHEET_NAME = 'Respuestas de formulario 1';

function doGet(e) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    var data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      return createJsonResponse({ status: "empty", leads: [] });
    }

    var leads = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rowIndex = i + 1;

      var fecha = row[0] ? row[0].toString() : '';
      var nombre = row[1] ? row[1].toString().trim() : '';
      var whatsapp = row[2] ? row[2].toString().trim() : '';
      var marca = row[4] ? row[4].toString().trim() : '';
      var modelo = row[5] ? row[5].toString().trim() : '';
      var ano = row[6] ? row[6].toString().replace('.0', '') : '';
      var km = row[7] ? row[7].toString().replace('.0', '') : '';
      var papeles = row[8] ? row[8].toString().trim() : '';
      var comentario = row[9] ? row[9].toString().trim() : '';
      var tasacion = row[10] ? parseFloat(row[10]) || 0 : 0;
      var estado = row[12] ? row[12].toString().trim() : '';

      leads.push({
        row: rowIndex,
        fecha: fecha,
        nombre: nombre,
        whatsapp: sanitizePhone(whatsapp),
        marca: marca,
        modelo: modelo,
        ano: ano,
        km: km,
        papeles: papeles,
        comentario: comentario,
        tasacion: tasacion,
        estado: estado,
        isPending: (tasacion === 0)
      });
    }

    // Más recientes primero
    leads.reverse();

    return createJsonResponse({
      status: "ok",
      count: leads.length,
      leads: leads
    });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      body = e.parameter;
    }

    var rowIndex = parseInt(body.rowIndex || body.row, 10);
    var tasacion = parseFloat(body.tasacion) || 0;
    var estado = body.estado || 'TASADO';

    if (!rowIndex || rowIndex < 2) {
      return createJsonResponse({ status: "error", message: "Fila no válida" });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];

    // Columna K (11) es TASACION SF
    sheet.getRange(rowIndex, 11).setValue(tasacion);

    // Columna M (13) es ESTADO
    if (estado) {
      sheet.getRange(rowIndex, 13).setValue(estado);
    }

    return createJsonResponse({
      status: "ok",
      row: rowIndex,
      tasacion: tasacion,
      estado: estado
    });
  } catch (err) {
    return createJsonResponse({ status: "error", message: err.toString() });
  }
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizePhone(phoneRaw) {
  if (!phoneRaw) return "";
  var str = phoneRaw.toString().trim();
  if (str.indexOf('E') !== -1 || str.indexOf('e') !== -1) {
    var num = Number(str);
    if (!isNaN(num)) str = num.toFixed(0);
  }
  var digits = str.replace(/[^0-9]/g, '');
  if (digits.length === 9 && digits.charAt(0) === '0') return '598' + digits.substring(1);
  if (digits.length === 8 && digits.charAt(0) === '9') return '598' + digits;
  return digits;
}
