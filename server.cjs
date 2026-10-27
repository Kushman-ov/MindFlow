const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  try {
    const message = req.body.message;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Напиши сообщение для AI."
      });
    }

    if (!process.env.ZVENOAI_API_KEY) {
      return res.status(500).json({
        error: "Не найден API-ключ в файле .env."
      });
    }

    const response = await fetch(
      "https://api.zveno.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.ZVENOAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "openai/gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Ты — MindFlow, AI-помощник внутри приложения управления задачами.

Если пользователь просит создать, добавить или запланировать задачу, верни только JSON без Markdown и пояснений.

Формат:
{"action":"create_task","title":"Купить продукты","duration":20,"priority":"Важно","category":"Личное"}

Правила:
- title — название задачи.
- duration — длительность в минутах. Если пользователь не указал время, используй 15.
- priority — одно из значений: "Срочно", "Важно", "Обычно", "Можно позже".
- category — одно из значений: "Работа", "Дом", "Здоровье", "Отношения", "Личное", "Отдых".
- Для просьбы добавить задачу обязательно возвращай JSON с полями action, title, duration, priority, category.
- На обычные вопросы отвечай обычным русским текстом.`
            },
            {
              role: "user",
              content: message
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Ошибка ответа AI."
      });
    }

    res.json({
      reply: data.choices?.[0]?.message?.content || "AI не вернул ответ."
    });
  } catch (error) {
    console.error("Ошибка MindFlow:", error);

    res.status(500).json({
      error: "Не удалось связаться с AI. Проверь подключение к интернету."
    });
  }
});

app.listen(3001, () => {
  console.log("MindFlow AI server запущен: http://localhost:3001");
});