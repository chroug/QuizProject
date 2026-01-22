// server/index.js - VERSION 8 QUESTIONS ALÉATOIRES
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const prisma = new PrismaClient();
const SECRET_KEY = "mon_secret_super_securise";

app.use(express.json());
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
  console.log('🔌 Connecté:', socket.id);
  socket.on('join_game_room', (gameId) => {
    socket.join(gameId);
    socket.data.gameId = gameId;
  });
  
  // Nettoyage déconnexion
  socket.on('disconnect', async () => {
    const gameId = socket.data.gameId;
    if (gameId) {
        try {
            const game = await prisma.activeGame.findUnique({ where: { id: gameId } });
            if (game && game.status === "WAITING") {
                await prisma.activeGame.delete({ where: { id: gameId } });
            }
        } catch (e) {}
    }
  });

  socket.on('leave_game', async () => {
      const gameId = socket.data.gameId;
      if (gameId) {
         try {
             const game = await prisma.activeGame.findUnique({ where: { id: gameId } });
             if (game?.status === "WAITING") await prisma.activeGame.delete({ where: { id: gameId } });
             if (game?.status === "PLAYING") {
                 await prisma.activeGame.update({ where: { id: gameId }, data: { status: "FINISHED" } });
                 io.to(gameId).emit('game_update', { ...game, status: "FINISHED" });
             }
         } catch(e){}
      }
  });
});

// --- ROUTES AUTH (Inchangées) ---
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = await prisma.user.create({ data: { username, email, password_hash: hashedPassword, region: "FR" } });
      res.json({ message: "Utilisateur créé !", userId: newUser.id });
    } catch (e) { res.status(500).json({ error: "Erreur" }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ error: "Erreur" });
      const token = jwt.sign({ userId: user.id, username: user.username }, SECRET_KEY);
      res.json({ token, username: user.username, userId: user.id });
    } catch (e) { res.status(500).json({ error: "Erreur" }); }
});

app.get('/api/quizzes', async (req, res) => {
    const quizzes = await prisma.quiz.findMany({ include: { questions: true } });
    res.json(quizzes);
});
app.get('/api/quizzes/:id', async (req, res) => {
    const quiz = await prisma.quiz.findUnique({ where: { id: parseInt(req.params.id) }, include: { questions: { include: { answers: true } } } });
    res.json(quiz);
});

// --- API DE JEU ---

// Route simplifiée pour créer le quiz lors de la publication
app.post('/api/quizzes', async (req, res) => {
  const { title, description, category, coverImage, creatorId, questions } = req.body;
  
  // Petite sécurité : on vérifie qu'il y a des questions
  if (!questions || questions.length < 1) {
      return res.status(400).json({ error: "Il faut au moins une question." });
  }

  try {
    const newQuiz = await prisma.quiz.create({
      data: {
        title, 
        description, 
        category: category || "Autre", 
        coverImage: coverImage || "",
        creatorId: parseInt(creatorId),
        questions: {
          create: questions.map(q => ({
            text: q.text, 
            timeLimit: parseInt(q.timeLimit) || 10,
            answers: { 
                create: q.answers.map(a => ({ text: a.text, isCorrect: a.isCorrect })) 
            }
          }))
        }
      }
    });
    console.log(`✅ Quiz créé : ${newQuiz.title}`);
    res.json(newQuiz);
  } catch (error) {
    console.error("Erreur création quiz:", error);
    res.status(500).json({ error: "Impossible de créer le quiz" });
  }
});

// 1. JOIN AVEC SÉLECTION ALÉATOIRE
app.post('/api/game/join', async (req, res) => {
  const { userId, quizId, socketId } = req.body;
  const uId = parseInt(userId);
  const qId = parseInt(quizId);

  try {
    // Nettoyage anciens
    const alreadyPlaying = await prisma.activeGame.findFirst({
      where: { OR: [{ player1Id: uId }, { player2Id: uId }], status: { in: ["WAITING", "PLAYING", "ROUND_SUMMARY"] } }
    });
    if (alreadyPlaying) {
      if (alreadyPlaying.status === "WAITING") await prisma.activeGame.delete({ where: { id: alreadyPlaying.id } });
      else return res.json({ error: "ALREADY_IN_GAME", quizId: alreadyPlaying.quizId });
    }

    // Recherche partie existante
    const potentialGames = await prisma.activeGame.findMany({
      where: { quizId: qId, status: "WAITING", player1Id: { not: uId } }
    });

    let validGame = null;
    for (const game of potentialGames) {
        const remoteSocket = io.sockets.sockets.get(game.player1SocketId);
        if (remoteSocket) { validGame = game; break; }
        else await prisma.activeGame.delete({ where: { id: game.id } });
    }

    if (validGame) {
      const startedGame = await prisma.activeGame.update({
        where: { id: validGame.id },
        data: { player2Id: uId, status: "PLAYING", roundStartTime: new Date() }
      });
      io.to(startedGame.id).emit('game_update', startedGame);
      return res.json({ gameId: startedGame.id, role: "player2", quizId: qId });
    }

    // CRÉATION NOUVELLE PARTIE (C'est ici qu'on pioche les 8 questions)
    // 1. On récupère TOUTES les questions du quiz
    const quizData = await prisma.quiz.findUnique({
        where: { id: qId },
        include: { questions: { include: { answers: true } } }
    });

    if (!quizData || quizData.questions.length < 8) {
        return res.status(400).json({ error: "Ce quiz a moins de 8 questions !" });
    }

    // 2. On mélange et on prend les 8 premières
    const shuffledQuestions = quizData.questions
        .sort(() => 0.5 - Math.random())
        .slice(0, 8);

    // 3. On crée la partie en stockant ces questions
    const newGame = await prisma.activeGame.create({
      data: { 
          quizId: qId, 
          player1Id: uId, 
          status: "WAITING", 
          player1SocketId: socketId,
          gameQuestions: shuffledQuestions // STOCKAGE JSON
      }
    });
    res.json({ gameId: newGame.id, role: "player1", quizId: qId });

  } catch (error) { console.error(error); res.status(500).json({ error: "Erreur serveur" }); }
});

app.get('/api/game/:gameId', async (req, res) => {
    const game = await prisma.activeGame.findUnique({ where: { id: req.params.gameId } });
    if (!game) return res.status(404).json({ error: "Introuvable" });
    res.json(game);
});

app.post('/api/game/answer', async (req, res) => {
  const { gameId, userId, answerIndex, isCorrect } = req.body;
  try {
    const game = await prisma.activeGame.findUnique({ where: { id: gameId } });
    if (!game || game.status === "FINISHED") return res.status(400).send("Trop tard");

    
    const now = new Date();
    const timeTaken = (now - new Date(game.roundStartTime)) / 1000;
    
    // --- NOUVEAU CALCUL DES POINTS ---
    let points = 0;
    
    if (isCorrect) {
        // Règle : Marge d'1 seconde pour avoir 20 points
        if (timeTaken <= 1) {
            points = 20; 
        } else {
            // Après 1 seconde, on perd 1 point par seconde supplémentaire
            // Formule : 20 - (Temps total - 1 seconde gratuite)
            // Exemple : 3 sec écoulées -> 20 - (3 - 1) = 18 points.
            // On bloque le minimum à 10 points (pour qu'une bonne réponse vaille toujours au moins qqch)
            points = Math.round(Math.max(10, 20 - (timeTaken - 1)));
        }
    }
    // ---------------------------------

    const isP1 = parseInt(userId) === game.player1Id;

    const updatedGame = await prisma.activeGame.update({
      where: { id: gameId },
      data: isP1 
        ? { player1AnswerIndex: answerIndex, player1Score: { increment: points } }
        : { player2AnswerIndex: answerIndex, player2Score: { increment: points } }
    });

    io.to(gameId).emit('game_update', updatedGame);

    if (updatedGame.player1AnswerIndex !== null && updatedGame.player2AnswerIndex !== null) {
        if (updatedGame.status === "PLAYING") {
            setTimeout(async () => {
                const summaryGame = await prisma.activeGame.update({
                    where: { id: gameId },
                    data: { status: "ROUND_SUMMARY" }
                });
                io.to(gameId).emit('game_update', summaryGame);

                setTimeout(async () => {
                    // ON UTILISE LES QUESTIONS DE LA PARTIE, PAS CELLES DU QUIZ GLOBAL
                    const gameQuestions = summaryGame.gameQuestions; // Récupéré du JSON
                    const nextIndex = summaryGame.currentQuestionIndex + 1;
                    
                    if (nextIndex >= gameQuestions.length) {
                        const finishedGame = await prisma.activeGame.update({ where: { id: gameId }, data: { status: "FINISHED" } });
                        io.to(gameId).emit('game_update', finishedGame);
                    } else {
                        const nextGame = await prisma.activeGame.update({
                            where: { id: gameId },
                            data: { currentQuestionIndex: nextIndex, player1AnswerIndex: null, player2AnswerIndex: null, status: "PLAYING", roundStartTime: new Date() }
                        });
                        io.to(gameId).emit('game_update', nextGame);
                    }
                }, 3500);
            }, 1000);
        }
    }
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: "Bug réponse" }); }
});

const PORT = 3001;
server.listen(PORT, () => { console.log(`🚀 Serveur PRÊT sur http://localhost:${PORT}`); });