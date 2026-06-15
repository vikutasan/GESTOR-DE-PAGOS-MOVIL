export const processBankStatementImage = async (base64Image, apiKey) => {
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada');
  }

  // Remove data URL prefix if present
  const base64Data = base64Image.split(',')[1] || base64Image;

  const prompt = `
    Eres un asistente financiero experto. Extrae la información de la captura de pantalla de esta aplicación bancaria / tarjeta de crédito.
    Busca los montos exactos y devuelve los resultados en un objeto JSON estricto con las siguientes claves:
    {
      "credit_limit": número (Límite de crédito autorizado. Usa 0 si no aplica o no se encuentra),
      "current_debt": número (Saldo actual o deuda al corte. Usa 0 si no se encuentra),
      "cut_day": número del 1 al 31 (Día de la fecha de corte, sólo el número del día. Usa null si no se encuentra),
      "payment_day": número del 1 al 31 (Día de la fecha límite de pago, sólo el número del día. Usa null si no se encuentra),
      "payment_no_interest": número (Pago para no generar intereses. Usa 0 si no se encuentra),
      "available_credit": número (Crédito disponible o saldo disponible. Usa 0 si no se encuentra),
      "liquidation_amount": número (Monto total para liquidar. Usa 0 si no se encuentra)
    }
    Devuelve ÚNICAMENTE el JSON válido, sin comillas invertidas, sin texto adicional, sin bloques markdown.
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Data
            }
          }
        ]
      }
    ]
  };

  // Lista de modelos a intentar en orden. Si uno falla por no estar disponible, intenta el siguiente.
  const modelsToTry = [
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-pro-vision'
  ];

  let lastError = null;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || response.statusText);
      }

      const data = await response.json();
      const textResponse = data.candidates[0].content.parts[0].text;
      
      try {
        const cleanedText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedText);
      } catch (parseError) {
        throw new Error('No se pudo interpretar la respuesta de la IA. Intenta con otra imagen más clara.');
      }

    } catch (e) {
      console.warn(`Modelo ${model} falló: ${e.message}`);
      lastError = e;
      
      // Si el error es de llave inválida o cuota excedida, no tiene sentido intentar más modelos
      if (e.message.includes('API key not valid') || e.message.includes('quota')) {
        throw new Error(`Error con tu API Key: ${e.message}`);
      }
      
      // Si el error es de "not found" o "not supported", el loop continuará e intentará el siguiente modelo
    }
  }

  throw new Error(`Error en la API de Gemini. Ningún modelo soportó la petición. Último error: ${lastError.message}`);
};
