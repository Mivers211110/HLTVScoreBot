import puppeteer from "puppeteer";
import cheerio from "cheerio";
import axios from "axios";

async function getData() {
	//Get the html of the map page using puppeteer
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await page.goto("https://www.hltv.org/matches/2357663/liquid-vs-ninjas-in-pyjamas-blast-premier-fall-groups-2022");
	const data = await page.content();
	processData(data);
}

function processData(data) {
	const $ = cheerio.load(data);

	//get the map and the current round from the top of the scoreboard
	const html = $(".scoreboard .currentRoundText").html();
	const round = html.split("-->")[1].split("<")[0];
	const map = html.split("<!-- /react-text -->")[2].split("-->")[1];
	console.log(`round ${round} map ${map}`);
}

//post a slack message using axios and the slack API
async function postScore() {
	const url = "https://slack.com/api/chat.postMessage";
	const res = await axios.post(
		url,
		{
			channel: "#hltv-score-bot",
			text: "Hello, World!",
			username: "Test",
			icon_emoji: ":video_game:",
		},
		{ headers: { authorization: `Bearer ${slackToken}` } }
	);
}
// postScore().catch((err) => console.log(err));
getData();
