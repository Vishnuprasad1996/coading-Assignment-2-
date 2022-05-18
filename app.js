const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server running at http://localhost/3000/");
    });
  } catch (e) {
    console.log(`DB Error ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "hhhhhhhh", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQry = `
    SELECT *
    FROM user
    where username = "${username}";`;
  const dbUser = await db.get(selectUserQry);
  if (dbUser === undefined) {
    if (password.length > 5) {
      const createUserQry = `
            INSERT INTO
            user(name, username, password, gender)
            VALUES("${name}","${username}", "${hashedPassword}", "${gender}");`;
      await db.run(createUserQry);
      response.status(200);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQry = `
    SELECT *
    FROM user
    where username = "${username}";`;
  const dbUser = await db.get(selectUserQry);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "hhhhhhhh");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getFeedQry = `
    SELECT user.username, tweet, tweet.date_time
    FROM user INNER JOIN tweet ON user.user_id = tweet.user_id 
    WHERE tweet.user_id IN ( 
        SELECT follower.following_user_id
        FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE user.username = "${username}")
    ORDER BY tweet.date_time DESC
    LIMIT 4;`;
  const userTweets = await db.all(getFeedQry);
  response.send(userTweets);
});

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const userFollowingQry = `
  SELECT user.name
  FROM user
  WHERE user.user_id IN (
    SELECT follower.following_user_id
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE user.username = "${username}");`;
  const dbResponse = await db.all(userFollowingQry);
  response.send(dbResponse);
});

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;

  const followerOfUser = `
    SELECT user.name
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id
    WHERE follower.following_user_id IN (
        SELECT user.user_id
        FROM user
        WHERE username = "${username}");`;
  const dbResp = await db.all(followerOfUser);
  response.send(dbResp);
});

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const userFollowingQry = `
  SELECT *
  FROM tweet
  WHERE ${tweetId} IN (
    SELECT tweet.tweet_id
    FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id INNER JOIN tweet ON follower.following_user_id = tweet.user_id
    WHERE user.username = "${username}");`;
  const dbResponse = await db.get(userFollowingQry);
  if (dbResponse === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const userFollowQry = `
        SELECT tweet, COUNT(like.like_id) AS likes, COUNT(reply.reply_id) AS replies, tweet.dateTime
        FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id INNER JOIN like ON tweet.tweet_id = like.tweet_id
        WHERE tweet.tweet_id = ${tweetId}
        GROUP BY tweet.tweet_id;`;
    const dbLikeResp = await db.get(userFollowQry);
    response.send(dbResponse);
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userFollowingQry = `
    SELECT *
    FROM tweet
    WHERE ${tweetId} IN (
        SELECT tweet.tweet_id
        FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        WHERE user.username = "${username}");`;
    const dbResponse = await db.get(userFollowingQry);
    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const likedQry = `
        SELECT user.name
        FROM user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON tweet.tweet_id = like.tweet_id
        WHERE tweet.tweet_id = ${tweetId} ;`;
      const dbLikeResp = await db.all(likedQry);
      response.send({ likes: dbResponse });
    }
  }
);

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const userFollowingQry = `
    SELECT *
    FROM tweet
    WHERE ${tweetId} IN (
        SELECT tweet.tweet_id
        FROM user INNER JOIN follower ON user.user_id = follower.follower_user_id INNER JOIN tweet ON follower.following_user_id = tweet.user_id
        WHERE user.username = "${username}");`;
    const dbResponse = await db.get(userFollowingQry);
    if (dbResponse === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const DeleteTweetQry = `
        DELETE 
        FROM tweet
        WHERE tweet_id = ${tweetId};`;
      await db.run(DeleteTweetQry);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
