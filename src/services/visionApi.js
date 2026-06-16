export const processBankStatementImage = async (base64Image, apiKey) => {
  if (!apiKey) {
    throw new Error('API Key de Gemini no configurada');
  }

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

  // 1. Obtener los modelos que tu API Key específica tiene permitidos
  const modelsUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  let modelsResponse;
  try {
    modelsResponse = await fetch(modelsUrl);
  } catch (e) {
    throw new Error(`Error de conexión al verificar modelos: ${e.message}`);
  }

  if (!modelsResponse.ok) {
    const errData = await modelsResponse.json();
    throw new Error(`Error de API Key al consultar modelos: ${errData.error?.message || modelsResponse.statusText}`);
  }

  const modelsData = await modelsResponse.json();
  const availableModels = modelsData.models || [];
  
  // Filtrar solo los que soportan generateContent
  const validModels = availableModels.filter(m => 
    m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')
  ).map(m => m.name.replace('models/', ''));

  if (validModels.length === 0) {
    throw new Error('Tu API Key no tiene ningún modelo habilitado que soporte generateContent.');
  }

  // 2. Elegir el mejor modelo disponible en tu cuenta
  const preferredOrder = [
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-2.0-flash-exp',
    'gemini-pro-vision'
  ];

  let selectedModel = null;
  for (const pref of preferredOrder) {
    if (validModels.includes(pref)) {
      selectedModel = pref;
      break;
    }
  }

  // Si no hay ninguno de los preferidos, tomar el primero que tenga la palabra gemini
  if (!selectedModel) {
    selectedModel = validModels.find(m => m.includes('gemini')) || validModels[0];
  }

  // 3. Ejecutar la petición con el modelo confirmado
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Fallo con el modelo detectado (${selectedModel}): ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  const textResponse = data.candidates[0].content.parts[0].text;
  
  try {
    const cleanedText = textResponse.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (parseError) {
    throw new Error('No se pudo interpretar la respuesta de la IA. Intenta con otra imagen más clara.');
  }
};
