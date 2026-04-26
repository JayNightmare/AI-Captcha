const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// OpenRouter API Configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_KEY;
const MODEL = process.env.OPENROUTER_MODEL;

if (!OPENROUTER_API_KEY) {
	console.warn(
		"WARNING: OPENROUTER_API_KEY is not set in the environment.",
	);
}

app.post("/generate", async (req, res) => {
	try {
		const authHeader = req.headers.authorization;
		if (!authHeader || !authHeader.startsWith("Bearer ")) {
			return res.status(401).json({
				error: "Missing or invalid Authorization header. GitHub token required.",
			});
		}

		const githubToken = authHeader.split(" ")[1];

		// Verify token with GitHub
		const githubRes = await fetch("https://api.github.com/user", {
			headers: {
				Authorization: `Bearer ${githubToken}`,
				"User-Agent": "Git-CAPTCHA-Backend",
			},
		});

		if (!githubRes.ok) {
			console.error(
				"GitHub Auth Error:",
				await githubRes.text(),
			);
			return res
				.status(401)
				.json({ error: "Invalid GitHub token." });
		}

		const githubUser = await githubRes.json();
		console.log(`Authenticated user: ${githubUser.login}`);

		// You could add an allowlist check here:
		// const ALLOWED_USERS = ['your_github_username'];
		// if (!ALLOWED_USERS.includes(githubUser.login)) return res.status(403).json({ error: "Forbidden" });

		const { diff } = req.body;

		if (!diff) {
			return res
				.status(400)
				.json({ error: "Diff payload is required" });
		}

		const prompt = `From diff:\n${diff}\nJSON: {"real":"code","fake1":"wrong1","fake2":"wrong2"}`;

		const response = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${OPENROUTER_API_KEY}`,
					"Content-Type": "application/json",
					"HTTP-Referer":
						"https://captcha.endpoint-system.uk", // Required by OpenRouter
					"X-Title": "Git CAPTCHA", // Required by OpenRouter
				},
				body: JSON.stringify({
					model: MODEL,
					messages: [
						{
							role: "user",
							content: prompt,
						},
					],
					response_format: {
						type: "json_object",
					},
				}),
			},
		);

		if (!response.ok) {
			const errBody = await response.text();
			console.error("OpenRouter Error:", errBody);
			return res.status(500).json({
				error: "Failed to generate snippets from OpenRouter",
			});
		}

		const data = await response.json();
		const content = data.choices?.[0]?.message?.content;

		if (!content) {
			return res.status(500).json({
				error: "Invalid response from OpenRouter",
			});
		}

		// We parse and re-stringify to ensure valid JSON is returned
		const parsedContent = JSON.parse(content);
		return res.json(parsedContent);
	} catch (error) {
		console.error("Server Error:", error);
		res.status(500).json({ error: "Internal Server Error" });
	}
});

app.listen(port, () => {
	console.log(`Proxy backend listening on port ${port}`);
});
