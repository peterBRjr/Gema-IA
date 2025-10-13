import * as dotenv from "dotenv";
dotenv.config();

import express from "express";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { BufferMemory } from "langchain/memory";
import { RunnableSequence } from "@langchain/core/runnables";
import { Tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

class ObterIdadeAtualTool extends Tool {
  name = "obter_idade_atual";
  description = "Retorna a idade atual de uma pessoa ou entidade. Use esta ferramenta quando o usuário perguntar sobre 'minha idade', 'sua idade' ou 'qual a idade'.";
  schema = { type: "object", properties: {} };
  async _call(input) {
    console.log("\n*** FERRAMENTA 'obter_idade_atual' EXECUTADA ***\n");
    return "A idade atual é 30 anos.";
  }
}

const model = new ChatGoogleGenerativeAI({
   model: "gemini-2.0-flash",
   apiKey: process.env.GOOGLE_API_KEY,
});

const tools = [new ObterIdadeAtualTool()];
const modelWithTools = model.bind({ tools });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "Você é um assistente prestativo chamado Gema. Responda educadamente e use a ferramenta 'obter_idade_atual' quando necessário."],
  new MessagesPlaceholder("chat_history"),
  ["human", "{input}"],
]);

const sessions = {};
function getMemoryForSession(sessionId) {
  if (!sessions[sessionId]) {
    sessions[sessionId] = new BufferMemory({
      memoryKey: "chat_history",
      returnMessages: true,
    });
  }
  return sessions[sessionId];
}

const chain = RunnableSequence.from([
  {
    input: (initialInput) => initialInput.input,
    chat_history: async (initialInput) => {
      const memory = getMemoryForSession(initialInput.sessionId);
      const history = await memory.loadMemoryVariables({});
      return history.chat_history;
    },
  },
  prompt,
  modelWithTools,
]);

const app = express();
const port = 3000;
app.use(express.json());

app.post("/chat", async (req, res) => {
  try {
    const userInput = req.body.message;
    const sessionId = "1";
    if (!userInput) {
      return res.status(400).json({ error: "A mensagem não pode estar vazia." });
    }

    console.log(`Recebido do Flutter: ${userInput}`);

    const memory = getMemoryForSession(sessionId);
    const response = await chain.invoke({
        input: userInput,
        sessionId: sessionId,
    });

    let finalResponse = response;
    if (finalResponse.tool_calls && finalResponse.tool_calls.length > 0) {
        console.log("\n*** Gema solicitou uma Chamada de Ferramenta... ***");
        
        const toolOutputs = [];
        for (const call of finalResponse.tool_calls) {
            const toolToRun = tools.find((tool) => tool.name === call.name);
            if (toolToRun) {
                const output = await toolToRun.call(call.args);
                toolOutputs.push(new ToolMessage({
                    content: output,
                    name: call.name,
                    toolCallId: call.id,
                }));
            }
        }
        
        const history = await memory.loadMemoryVariables({});
        const secondResponse = await modelWithTools.invoke([
            ...history.chat_history,
            new HumanMessage(userInput),
            finalResponse,
            ...toolOutputs
        ]);
        
        finalResponse = secondResponse;
    }

    await memory.saveContext(
        { input: userInput },
        { output: finalResponse.content }
    );
    
    const gemaResponse = finalResponse.content;
    console.log(`Enviando para o Flutter: ${gemaResponse}`);

    res.json({ reply: gemaResponse });

  } catch (error) {
    console.error("Erro no endpoint /chat:", error);
    const errorMessage = error.message || "Ocorreu um erro no servidor.";
    res.status(500).json({ error: errorMessage });
  }
});

app.listen(port, () => {
  console.log(`Servidor do chatbot rodando em http://localhost:${port}`);
});