// 1 Importar librerias
const express = require("express"),
  body_parser = require("body-parser"),
  axios = require("axios"),
  app = express().use(body_parser.json()), // creates express http server
  FormData = require("form-data");

// 2 Carga de variables de entorno

const whatsapp_token = process.env.WHATSAPP_TOKEN;
const assistant_id = process.env.ASSISTANT_ID;
const openai_api = axios.create({
  baseURL: "https://api.openai.com/v1/",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENAI_TOKEN}`,
    "OpenAI-Beta": "assistants=v1",
  },
  onError: (error) => {
    console.log("Error Open AI", error);
  },
}); 

// 3 Configuración de la API de OpenAI (URL y headers)


const hook_api = axios.create({
  baseURL: "https://hook.eu2.make.com/",
  headers: {
    "Content-Type": "application/json",
  },
  onError: (error) => {
    console.log("Error Hook API", error);
  },
});

// definicion de variables

let thread_id, run_id, message_id, tool_call_id, output;


// 4 definicion de funciones (endpoints)

const functions = {
  fecha_hoy: () => {
    return new Date().toISOString();
  },
  comprobar_reserva: async (params) => {
    const { data } = await hook_api.post(
      "3kiyahmwul8qg5f7sps8zzppv5h8dnnp",
      JSON.parse(params)
    );
    return data;
  },
  ver_disponibilidad: async (params) => {
    const { data } = await hook_api.post(
      "bzm1bcp3cgykq5b004zptvxy00yhluic",
      params
    );
    return data;
  },
  eliminar_mesa: async (params) => {
    const { data } = await hook_api.post(
      "ic3lgm2m85a8pjpwvd06judp06mt98gw",
      params
    );
    return data;
  },
  reservar_mesa: async (params) => {
    const { data } = await hook_api.post(
      "7dovs57qgwgfc5buyakktndx2s3bto8k",
      params
    );
    return data;
  },
  reservar_mesa: async (params) => {
    const { data } = await hook_api.post(
      "7dovs57qgwgfc5buyakktndx2s3bto8k",
      params
    );
    return data;
  },
};

// 5 funcion para transcribir audios a texto

const transcript_audio = async (media_id) => {
  try {
    const media = await axios({
      method: "GET",
      url: `https://graph.facebook.com/v17.0/${media_id}?access_token=${whatsapp_token}`,
    });

    const file = await axios({
      method: "GET",
      url: media.data.url,
      responseType: "arraybuffer",
      headers: {
        Authorization: "Bearer " + whatsapp_token,
      },
    });

    const buffer = Buffer.from(file.data);

    // Create a FormData object
    let form_data = new FormData();
    form_data.append("file", buffer, {
      filename: "grabacion.ogg",
      contentType: "audio/ogg",
    });
    form_data.append("model", "whisper-1");

    // Envia solicitud 
    const openai_transcription = await axios({
      method: "post",
      url: "https://api.openai.com/v1/audio/transcriptions",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_TOKEN,
        ...form_data.getHeaders(),
      },
      maxBodyLength: Infinity,
      data: form_data,
    });

    return openai_transcription.data.text;
  } catch (error) {
    console.error(error);
  }
};

// 6 Funcion para interatuar con la API de asistente de OPENAI

async function create_thread() {
  try {
    const {
      data: { id },
    } = await openai_api.post("threads");

    thread_id = id;
  } catch(e) {}
}

const create_message = async (content) => {
  try {
    const { data } = await openai_api.post(`threads/${thread_id}/messages`, {
      role: "user",
      content,
    });
  } catch(e) {}
};

const create_run = async () => {
  try {
    const {
      data: { id },
    } = await openai_api.post(`threads/${thread_id}/runs`, {
      assistant_id,
    });

    run_id = id;
  } catch(e) {}
};

const get_run_details = async () => {
  try {
    const { data } = await openai_api.get(`threads/${thread_id}/runs/${run_id}`);
    return data;
  } catch(e) {}
};

const submit_tool_outputs = async () => {
  await openai_api.post(
    `threads/${thread_id}/runs/${run_id}/submit_tool_outputs`,
    {
      tool_outputs: [
        {
          tool_call_id,
          output,
        },
      ],
    }
  );
};

const wait_till_run_complete = async () => {
  const data = await get_run_details();
  if (["queued", "in_progress"].includes(data.status) === false) {
    if (data.status === "requires_action") {
      const function_name =
        data.required_action.submit_tool_outputs.tool_calls[0].function.name;
      if (functions[function_name]) {
        tool_call_id =
          data.required_action.submit_tool_outputs.tool_calls[0].id;
        const arguments =
          data.required_action.submit_tool_outputs.tool_calls[0].function
            .arguments;
        output = await functions[function_name](arguments);
        await submit_tool_outputs();
        await wait_till_run_complete();
      }
    }
    return;
  }
  await wait_till_run_complete();
};

const get_run_steps = async () => {
  const {
    data: { data },
  } = await openai_api.get(`threads/${thread_id}/runs/${run_id}/steps`);

  message_id = data[0].step_details.message_creation.message_id;
};

const get_message = async () => {
  const { data } = await openai_api.get(
    `threads/${thread_id}/messages/${message_id}`
  );

  return data.content[0].text.value;
};

// 7 Proceso de ejecucion de las funciones asincronas

const chatgpt_execute = async (message) => {
  // Creación de thread
  await create_thread();
  // Creación de mensaje inicial, saludo
  await create_message(message);
  // Crear runner
  await create_run();
  // Esperar que se complete el mismo
  await wait_till_run_complete();
  // Correr etapas
   await get_run_steps();
  // Obtener mensaje
  return await get_message();
};

// 8 Funcion para enviar mensajes a Whatsapp

const send_message = async (phone_number_id, to, text) => {
  try {
    axios({
      method: "POST",
      url: `https://graph.facebook.com/v12.0/${phone_number_id}/messages?access_token=${whatsapp_token}`,
      data: {
        messaging_product: "whatsapp",
        to: to,
        text: { body: text },
      },
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {}
};


// Establece el puerto del servidor y registra el mensaje en caso de éxito


app.listen(process.env.PORT || 1337, () => console.log("webhook is listening"));


// Acepta solicitudes POST en el endpoint /webhook


app.post("/webhook", async (req, res) => {
  // Información sobre la carga útil de los mensajes de texto de WhatsApp : https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  if (req.body.object) {
    console.log(req.body.entry[0].changes[0].value);
    if (req.body.entry[0].changes[0].value.messages) {
      let phone_number_id =
        req.body.entry[0].changes[0].value.metadata.phone_number_id;
      let { from, type } =
        req.body.entry[0].changes[0].value.messages[0];
      let message;
      if (type === "text") {
        message = req.body.entry[0].changes[0].value.messages[0].text.body;
      } else if (type === "audio") {
        await send_message(
          phone_number_id,
          from,
          "Procesando nota de voz. Espera..."
        );
        message = await transcript_audio(
          req.body.entry[0].changes[0].value.messages[0].audio.id
        );
        const transcription =
          '*Transcripción del audio:*\n\n"' +
          message +
          '"\n\n_tardará unos segundos..._';
        await send_message(phone_number_id, from, transcription);
      }
      const chatgpt_response = await chatgpt_execute(message);
      await send_message(phone_number_id, from, chatgpt_response);
    }
    res.sendStatus(200);
  } else {
    // Devuelve un '404 no encontrado' si el evento no proviene de una API de WhatsApp
    res.sendStatus(401);
  }
});

// Acepta solicitudes GET en el punto final /webhook. Necesita esta URL para configurar el webhook inicialmente.
// información sobre la carga útil de la solicitud de verificación: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests

app.get("/webhook", (req, res) => {
  /**
   
   *Este será el valor del token de verificación cuando configure el webhook.
   **/
  const verify_token = process.env.VERIFY_TOKEN;

  // Analizar parámetros de la solicitud de verificación del webhook
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Comprobar si se envió un token y un modo.
  if (mode && token) {
    // Verifique que el modo y el token enviado sean correctos
    if (mode === "subscribe" && token === verify_token) {
      // Responda con 200 OK y token de desafío de la solicitud
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Responde con '403 Prohibido' si los tokens de verificación no coinciden
      res.sendStatus(403);
    }
  }
});
