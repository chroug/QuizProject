import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function GamePage() {
  const { id: quizId } = useParams();
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  
  const [quiz, setQuiz] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [role, setRole] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [hasAnswered, setHasAnswered] = useState(false);
  const [prevScores, setPrevScores] = useState({ p1: 0, p2: 0 });

  const socketRef = useRef();

  useEffect(() => {
    // Nettoyage visuel
    setQuiz(null);
    setGameState(null);
    setHasAnswered(false);

    // 1. On se connecte au Socket
    const newSocket = io("http://localhost:3001");
    socketRef.current = newSocket;

    // 2. ON ATTEND D'ÊTRE CONNECTÉ avant de contacter l'API
    // C'est crucial pour avoir un socket.id valide
    newSocket.on('connect', () => {
        console.log("Connecté au socket avec l'ID :", newSocket.id);
        
        // Une fois connecté, on charge le quiz et on rejoint
        axios.get(`http://localhost:3001/api/quizzes/${quizId}`).then(res => {
            setQuiz(res.data);
            
            // ON ENVOIE LE SOCKET ID DANS LA REQUÊTE 👇
            axios.post('http://localhost:3001/api/game/join', { 
                userId, 
                quizId, 
                socketId: newSocket.id // <--- C'EST NOUVEAU
            })
            .then(gameRes => {
                if (gameRes.data.error === "ALREADY_IN_GAME") {
                    alert("Déjà en jeu !");
                    navigate(`/play/${gameRes.data.quizId}`);
                    return;
                }

                const gId = gameRes.data.gameId;
                setGameId(gId);
                setRole(gameRes.data.role);
                
                newSocket.emit('join_game_room', gId);

                axios.get(`http://localhost:3001/api/game/${gId}`).then(r => {
                    setGameState(r.data);
                    if (r.data.currentQuestionIndex > 0) {
                        setPrevScores({ p1: r.data.player1Score, p2: r.data.player2Score });
                    }
                });
            });
        });
    });

    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, [quizId]); // On retire 'userId' des dépendances pour éviter les re-renders inutiles

  // --- 2. SOCKET & TIMER ---
  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.on('game_update', (updatedGame) => {
      if (updatedGame.status === "PLAYING" && gameState && updatedGame.currentQuestionIndex > gameState.currentQuestionIndex) {
            setHasAnswered(false);
            setPrevScores({ p1: updatedGame.player1Score, p2: updatedGame.player2Score });
      }
      setGameState(updatedGame);
    });
    return () => { socketRef.current.off('game_update'); };
  }, [gameState]);

  useEffect(() => {
    if (!gameState || gameState.status !== "PLAYING") return;
    const timer = setInterval(() => {
      const elapsed = (new Date().getTime() - new Date(gameState.roundStartTime).getTime()) / 1000;
      setTimeLeft(Math.max(0, 10 - elapsed));
    }, 50);
    return () => clearInterval(timer);
  }, [gameState]);

  // --- ACTIONS ---
  const handleAnswer = async (index, isCorrect) => {
    if (hasAnswered || gameState.status !== "PLAYING") return;
    setHasAnswered(true);
    await axios.post('http://localhost:3001/api/game/answer', { gameId, userId, answerIndex: index, isCorrect });
  };

  // NOUVEAU : Fonction pour quitter proprement
  const handleQuit = () => {
      if (socketRef.current) socketRef.current.emit('leave_game'); // On prévient le serveur
      navigate('/home'); // On change de page
  };

  // --- RENDUS ---
  if (!quiz || !gameState) return <div className="bg-gray-900 min-h-screen text-white flex items-center justify-center">Chargement...</div>;

  // ÉCRAN ATTENTE
  if (gameState.status === "WAITING") {
    return (
      <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8"></div>
        <h2 className="text-2xl font-bold animate-pulse mb-4">En attente d'un adversaire...</h2>
        
        {/* BOUTON ANNULER AJOUTÉ ICI 👇 */}
        <button onClick={handleQuit} className="px-6 py-2 border border-gray-500 rounded-full text-gray-400 hover:text-white hover:border-white transition">
            Annuler la recherche
        </button>
      </div>
    );
  }

  // ÉCRAN FIN
  if (gameState.status === "FINISHED") {
      const myFinal = role === 'player1' ? gameState.player1Score : gameState.player2Score;
      const oppFinal = role === 'player1' ? gameState.player2Score : gameState.player1Score;
      const iWon = myFinal > oppFinal;
      return (
          <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center">
              <h1 className="text-6xl font-black mb-4">{iWon ? "VICTOIRE ! 🏆" : "DÉFAITE..."}</h1>
              <div className="text-2xl">Score: {myFinal} - {oppFinal}</div>
              <button onClick={() => navigate('/home')} className="mt-8 bg-white text-black px-6 py-2 rounded font-bold">Retour Accueil</button>
          </div>
      );
  }

  // ÉCRAN JEU
  const currentQ = quiz.questions[gameState.currentQuestionIndex];
  if (!currentQ) return null;
  const myScore = role === 'player1' ? gameState.player1Score : gameState.player2Score;
  const oppScore = role === 'player1' ? gameState.player2Score : gameState.player1Score;
  const oppAnswerIndex = role === 'player1' ? gameState.player2AnswerIndex : gameState.player1AnswerIndex;
  const isOpponentCorrect = oppAnswerIndex !== null && currentQ.answers[oppAnswerIndex]?.isCorrect;
  const myGain = myScore - (role === 'player1' ? prevScores.p1 : prevScores.p2);
  const oppGain = oppScore - (role === 'player1' ? prevScores.p2 : prevScores.p1);

  return (
    <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col relative overflow-hidden">
      
      {/* HEADER AVEC BOUTON QUITTER */}
      <div className="bg-gray-800 p-4 flex justify-between items-center h-24 z-10 relative">
        <button onClick={handleQuit} className="absolute left-4 top-4 text-gray-500 hover:text-white text-xs font-bold uppercase">
            ← Quitter
        </button>

        <div className="w-1/3 text-right pr-4"><div className="text-xs text-blue-400 font-bold">MOI</div><div className="text-4xl font-black">{myScore}</div></div>
        <div className="w-1/3 flex justify-center"><div className={`text-4xl font-black ${timeLeft < 3 ? 'text-red-500' : 'text-green-500'}`}>{Math.ceil(timeLeft)}</div></div>
        <div className="w-1/3 text-left pl-4"><div className="text-xs text-red-400 font-bold">ADV.</div><div className="text-4xl font-black">{oppScore}</div></div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold text-center mb-8">{currentQ.text}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-3xl">
          {currentQ.answers.map((ans, idx) => {
             let style = "bg-gray-800 border-gray-600";
             if (hasAnswered || gameState.status === "ROUND_SUMMARY") {
                 if (ans.isCorrect) style = "bg-green-600 border-green-500";
                 else if (hasAnswered) style = "opacity-25 grayscale";
             }
             return <button key={idx} onClick={() => handleAnswer(idx, ans.isCorrect)} disabled={hasAnswered || gameState.status !== "PLAYING"} className={`p-6 rounded-xl font-bold border-2 transition-all ${style}`}>{ans.text}</button>
          })}
        </div>
        <div className="h-8 mt-8">{oppAnswerIndex !== null && gameState.status === "PLAYING" && <div className={`px-4 py-1 rounded-full text-xs font-bold border ${isOpponentCorrect ? 'text-green-400 border-green-500' : 'text-red-400 border-red-500'}`}>L'adversaire a répondu...</div>}</div>
      </div>

      {gameState.status === "ROUND_SUMMARY" && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in">
              <div className="bg-gray-800 p-8 rounded-2xl text-center max-w-sm w-full border border-gray-600 shadow-2xl">
                  <h3 className="text-gray-400 text-xs font-bold uppercase mb-6 tracking-widest">Fin de la manche</h3>
                  <div className="flex justify-around items-end mb-8">
                      <div><div className="text-blue-400 font-bold text-xs mb-1">MOI</div><div className={`text-4xl font-black ${myGain > 0 ? 'text-green-400' : 'text-gray-600'}`}>+{myGain}</div></div>
                      <div className="h-10 w-px bg-gray-600 mx-4"></div>
                      <div><div className="text-red-400 font-bold text-xs mb-1">ADV.</div><div className={`text-4xl font-black ${oppGain > 0 ? 'text-red-400' : 'text-gray-600'}`}>+{oppGain}</div></div>
                  </div>
                  <div className="text-white font-bold text-xl mb-4">Question suivante...</div>
                  <div className="h-1 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 animate-[width_3s_linear_forwards]" style={{width: '0%'}}></div></div>
                  <style>{`@keyframes width { to { width: 100%; } }`}</style>
              </div>
          </div>
      )}
    </div>
  );
}