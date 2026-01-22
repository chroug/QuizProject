// server/index.js - GESTION DÉCONNEXION & NETTOYAGE
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

// --- SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('🔌 Connecté:', socket.id);

  // On stocke les infos du joueur directement dans le socket pour les retrouver s'il se déconnecte
  socket.on('join_game_room', (gameId) => {
    socket.join(gameId);
    socket.data.gameId = gameId; // On mémorise l'ID de la partie
    console.log(`-> Salle ${gameId} rejointe par ${socket.id}`);
  });

  // GESTION DU DÉPART (Retour arrière ou fermeture onglet)
  socket.on('disconnect', async () => {
    console.log('Déconnexion:', socket.id);
    
    const gameId = socket.data.gameId;
    if (gameId) {
        try {
            // On regarde l'état de la partie
            const game = await prisma.activeGame.findUnique({ where: { id: gameId } });
            
            if (game && game.status === "WAITING") {
                // CAS 1 : Il attendait un adversaire et il part -> ON SUPPRIME LA PARTIE
                // Comme ça, il ne sera plus bloqué !
                await prisma.activeGame.delete({ where: { id: gameId } });
                console.log(`🗑️ Partie ${gameId} supprimée (Joueur parti en attente)`);
            }
            // CAS 2 : La partie était en cours (PLAYING) -> On ne fait rien (pour permettre la reconnexion en cas de refresh)
        } catch (e) {
            console.error("Erreur nettoyage disconnect", e);
        }
    }
  });

  // GESTION DU "QUITTER" EXPLICITE (Bouton Quitter)
  socket.on('leave_game', async () => {
      const gameId = socket.data.gameId;
      if (!gameId) return;

      try {
          const game = await prisma.activeGame.findUnique({ where: { id: gameId } });
          if (game) {
              if (game.status === "WAITING") {
                  await prisma.activeGame.delete({ where: { id: gameId } });
              } else if (game.status === "PLAYING") {
                  // Si on quitte en plein match, on déclare forfait (FINISHED)
                  await prisma.activeGame.update({ 
                      where: { id: gameId }, 
                      data: { status: "FINISHED" } 
                  });
                  // On prévient l'adversaire
                  io.to(gameId).emit('game_update', { ...game, status: "FINISHED" });
              }
          }
      } catch (e) { console.error(e); }
  });
});

// --- ROUTES API (Authentification & Quiz) ---
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

// --- MATCHMAKING ---
app.post('/api/game/join', async (req, res) => {
  // On récupère le socketId envoyé par le client
  const { userId, quizId, socketId } = req.body; 
  const uId = parseInt(userId);
  const qId = parseInt(quizId);

  try {
    // 1. NETTOYAGE (Comme avant)
    const alreadyPlaying = await prisma.activeGame.findFirst({
      where: { 
        OR: [{ player1Id: uId }, { player2Id: uId }],
        status: { in: ["WAITING", "PLAYING", "ROUND_SUMMARY"] }
      }
    });

    if (alreadyPlaying) {
      if (alreadyPlaying.status === "WAITING") {
          await prisma.activeGame.delete({ where: { id: alreadyPlaying.id } });
      } else {
          if (alreadyPlaying.quizId === qId) {
              const role = (alreadyPlaying.player1Id === uId) ? "player1" : "player2";
              return res.json({ gameId: alreadyPlaying.id, role, quizId: qId });
          } else {
              return res.json({ gameId: alreadyPlaying.id, role: "spectator", quizId: alreadyPlaying.quizId, error: "ALREADY_IN_GAME" });
          }
      }
    }

    // 2. RECHERCHE D'ADVERSAIRE (AVEC VÉRIFICATION SOCKET)
    // On cherche toutes les parties en attente
    const potentialGames = await prisma.activeGame.findMany({
      where: { quizId: qId, status: "WAITING", player1Id: { not: uId } }
    });

    let validGame = null;

    // On boucle sur les parties trouvées pour vérifier si le créateur est VRAIMENT là
    for (const game of potentialGames) {
        // On demande à Socket.io : "Ce socket est-il connecté ?"
        const remoteSocket = io.sockets.sockets.get(game.player1SocketId);
        
        if (remoteSocket) {
            // OUI ! Le joueur est en ligne, on peut rejoindre
            validGame = game;
            break; // On a trouvé, on arrête de chercher
        } else {
            // NON ! C'est un fantôme (il a changé de page), on supprime cette partie poubelle
            await prisma.activeGame.delete({ where: { id: game.id } });
            console.log(`👻 Partie fantôme ${game.id} supprimée (Joueur déconnecté)`);
        }
    }

    if (validGame) {
      // On rejoint la partie valide trouvée
      const startedGame = await prisma.activeGame.update({
        where: { id: validGame.id },
        data: { player2Id: uId, status: "PLAYING", roundStartTime: new Date() }
      });
      io.to(startedGame.id).emit('game_update', startedGame);
      return res.json({ gameId: startedGame.id, role: "player2", quizId: qId });
    }

    // 3. CRÉATION (On enregistre MON socketId)
    const newGame = await prisma.activeGame.create({
      data: { 
          quizId: qId, 
          player1Id: uId, 
          status: "WAITING",
          player1SocketId: socketId // <--- On sauvegarde ma "ligne téléphonique"
      }
    });
    res.json({ gameId: newGame.id, role: "player1", quizId: qId });

  } catch (error) {
    console.error("Erreur Join:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- LOGIQUE DE JEU ---
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
    let points = isCorrect ? Math.round(10 + Math.max(0, 10 - timeTaken)) : 0;
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
                    const currentQuiz = await prisma.quiz.findUnique({ where: { id: game.quizId }, include: { questions: true } });
                    const nextIndex = summaryGame.currentQuestionIndex + 1;
                    
                    if (nextIndex >= currentQuiz.questions.length) {
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
server.listen(PORT, () => {
  console.log(`🚀 Serveur PRÊT sur http://localhost:${PORT}`);
});