import puppeteer from "puppeteer";
import cheerio from "cheerio";
import axios from "axios";
import fs from "fs";

const slackMessageUrl = "https://slack.com/api/chat.postMessage";

let slackToken;

/**
 * array of the matches that are being tracked
 */
let matches = [
	{
		url: "https://www.hltv.org/matches/2357709/outsiders-vs-big-esl-pro-league-season-16",
		numberOfMaps: 3,
		matchScores: {
			Outsiders: 0,
			BIG: 0,
		},
		mapsPlayed: 0,
	},
];

async function getTestHtml(url) {
	//Get the html of the map page using puppeteer
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await page.goto(url);
	await page.click("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll");

	const data = await page.content();

	const $ = cheerio.load(data);

	// console.log($.html());

	fs.writeFile("testData.html", $.html(), function (err) {
		if (err) throw err;
		console.log("Saved!");
	});
}

/**
 * Get the slack token from the .json file
 * this is done so that the token is not exposed in the code
 * @returns {string} the slack token
 */
function getSlackToken() {
	if (slackToken) return slackToken;
	const data = fs.readFileSync("./token.json");
	const json = JSON.parse(data);
	slackToken = json.slacktoken;
	return slackToken;
}

/**
 * Get the data from the HLTV scoreboard
 * @param {object} url the url to get the data from
 * @returns {string} the html of the match page
 */
async function getData(match) {
	//Get the html of the map page using puppeteer
	const browser = await puppeteer.launch();
	const page = await browser.newPage();
	await page.goto(match.url);

	try {
		await page.click("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll");
	} catch (err) {
		console.log("No cookiebot found");
	}
	const data = await page.content();
	processData(data, match);
}

/**
 * Process the data from the HLTV scoreboard
 * @param {string} data the html of the match page
 * @param {object} match the match that the data belongs to
 */
function processData(data, match) {
	const $ = cheerio.load(data);
	let regex = /<.*?>/g;
	//get the map and the current round from the top of the scoreboard
	const html = $(".currentRoundText").html();
	console.log(html);

	//Check if there is a scoreboard present and the match is not yet started
	if (html && !match.hasStarted) {
		//Set the match to started
		match.hasStarted = true;
	}

	console.log(html.replace(regex, ""));

	let round, map;
	[round, map] = html.replace(regex, "").split(" - ");

	console.log(`round: ${round} map: ${map}`);
	//check if map changed
	if (match.map !== map) {
		match.map = map;
	}
	match.map = map;

	//check if the round has changed
	if (match.round === round) return;
	match.round = round;

	getTeamNames($, match);
	getScores($, match);
	let mapFinished = checkIfMapIsFinished(match);
	let matchWinner = checkIfMatchIsFinished(match);
	// composeMessage(match);
	if (mapFinished) {
		composeMessageMapFinished(match);
		match.scoreCt = 0;
		match.scoreT = 0;
	}

	if (matchWinner) {
		composeMessageMatchFinished(match);
		match.isFinished = true;
	}
}

/**
 * Get the teamNames from the page and add them to the match object
 * @param {string} $ the html of the match page
 * @param {object} match the match that the data belongs to
 */
function getTeamNames($, match) {
	//get the team names for the ct team and the T team from the page
	let ctTeam = $(".ctTeamHeaderBg .teamName").text().trim();
	let tTeam = $(".tTeamHeaderBg .teamName").text().trim();
	if (ctTeam.length < 1 || tTeam.length < 1) return;
	console.log(ctTeam + " vs " + tTeam);
	match.teamCt = ctTeam;
	match.teamT = tTeam;
}

/**
 * Get the scores from the HLTV scoreboard
 * @param {string} $ the html of the match page
 * @param {object} match the match that the data belongs to
 */
function getScores($, match) {
	//get the scores for the ct team and the T team from the page
	match.scoreCt = $(".ctScore").text().trim();
	match.scoreT = $(".tScore").text().trim();
}

function checkIfMapIsFinished(match) {
	if (match.scoreCt == 16 && match.scoreT < 15) {
		match.mapsPlayed++;
		match.matchScores[match.teamCt]++;
		return match.teamCt;
	}
	if (match.scoreT == 16 && match.scoreCt < 15) {
		match.mapsPlayed++;
		match.matchScores[match.teamT]++;
		return match.teamT;
	}
	if (match.scoreT <= 15 && match.scoreCt <= 15) {
		return false;
	}

	let tempT = match.scoreT - 15;
	let tempCt = match.scoreCt - 15;

	do {
		console.log(tempT);
		console.log(tempCt);
		if (tempT <= 3 && tempCt <= 3) {
			return false;
		}

		if (tempT == 4 && tempCt <= 2) {
			match.mapsPlayed++;
			match.matchScores[match.teamT]++;
			return match.teamT;
		}

		if (tempCt == 4 && tempT <= 2) {
			match.mapsPlayed++;
			match.matchScores[match.teamCt]++;
			return match.teamCt;
		}
		tempCt -= 3;
		tempT -= 3;
	} while (true);
}

function checkIfMatchIsFinished(match) {
	let mapsNeeded = Math.ceil(match.numberOfMaps / 2);
	if (match.matchScores[match.teamCt] == mapsNeeded) {
		match.isFinished = true;
		return match.teamCt;
	}
	if (match.matchScores[match.teamT] == mapsNeeded) {
		match.isFinished = true;
		return match.teamT;
	}
}

function composeMessageMapFinished(match, winner) {
	let userName = `${winner} won ${match.map}`;
	let message = `Map ${match.map} finished. ${match.teamCt} ${match.scoreCt} - ${match.scoreT} ${match.teamT}`;
	sendMessage(message, userName);
}

function composeMessageMatchFinished(match, winner) {
	let userName = `${winner} won the match`;
	let message = `${match.teamCt} ${match.matchScores[match.teamCt]} - ${match.matchScores[match.teamT]} ${match.teamT}`;
	sendMessage(message, userName);
}

/**
 * function that composes the message that is posted to slack
 * @param {object} match data object containing all relevant data for the match
 */
function composeMessage(match) {
	let username = match.teamCt + " vs " + match.teamT + " - " + match.map;
	let message = `${match.teamCt} ${match.scoreCt} - ${match.scoreT} ${match.teamT} - ${match.round}`;
	postMessage(message, username);
}

/**
 * post a slack message using axios and the slack API\
 * @param {string} message the message to post
 * @param {string} username the username that is used to post the message
 */
async function postMessage(message, username) {
	const url = slackMessageUrl;
	const res = await axios.post(
		url,
		{
			channel: "#hltv-score-bot",
			text: `${message}`,
			username: `${username}`,
			icon_emoji: ":video_game:",
		},
		{ headers: { authorization: `Bearer ${getSlackToken()}` } }
	);
}

async function main() {
	do {
		matches.forEach((match) => {
			if (!match.isFinished) {
				getData(match);
			}
		});
		//Wait for 3 minutes before checking the matches again
		await sleep(180000);
	} while (matches.some((match) => !match.isFinished));
}

// main();

// getData(matches[0]);

getTestHtml(matches[0].url);

/**
 * Helper function that stops the program for the given time
 * @param {number} ms the number of milliseconds to wait
 * @returns
 */
function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}
