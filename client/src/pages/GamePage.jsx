import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';

export default function GamePage() {
  const { id: quizId } = useParams();
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  
  // --- ÉTATS ---
  const [quiz, setQuiz] = useState(null);
  const [gameId, setGameId] = useState(null);
  const [role, setRole] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [timeLeft, setTimeLeft] = useState(10);
  const [hasAnswered, setHasAnswered] = useState(false);
  
  // NOUVEAU : On stocke quel bouton J'AI cliqué pour le mettre en rouge si faux
  const [myAnswerIndex, setMyAnswerIndex] = useState(null); 
  const [prevScores, setPrevScores] = useState({ p1: 0, p2: 0 });

  const socketRef = useRef();

  // --- 1. INITIALISATION ---
  useEffect(() => {
    // Nettoyage visuel au chargement
    setQuiz(null);
    setGameState(null);
    setHasAnswered(false);
    setMyAnswerIndex(null);

    const newSocket = io("http://localhost:3001");
    socketRef.current = newSocket;

    newSocket.on('connect', () => {
        console.log("Connecté Socket:", newSocket.id);
        
        axios.get(`http://localhost:3001/api/quizzes/${quizId}`).then(res => {
            setQuiz(res.data);
            
            axios.post('http://localhost:3001/api/game/join', { 
                userId, 
                quizId, 
                socketId: newSocket.id 
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
  }, [quizId]);

  // --- 2. ÉCOUTE SOCKET ---
  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.on('game_update', (updatedGame) => {
      // RESET POUR NOUVELLE QUESTION
      if (updatedGame.status === "PLAYING" && gameState && updatedGame.currentQuestionIndex > gameState.currentQuestionIndex) {
            setHasAnswered(false);
            setMyAnswerIndex(null); // On reset mon choix
            setPrevScores({ p1: updatedGame.player1Score, p2: updatedGame.player2Score });
      }
      setGameState(updatedGame);
    });
    return () => { socketRef.current.off('game_update'); };
  }, [gameState]);

  // --- 3. TIMER & AUTO-TIMEOUT ---
  useEffect(() => {
    if (!gameState || gameState.status !== "PLAYING") return;
    
    const timer = setInterval(() => {
      const elapsed = (new Date().getTime() - new Date(gameState.roundStartTime).getTime()) / 1000;
      const remaining = Math.max(0, 10 - elapsed);
      setTimeLeft(remaining);

      // NOUVEAU : Si temps écoulé et que je n'ai pas répondu -> Je force une réponse fausse (-1)
      if (remaining === 0 && !hasAnswered) {
          handleAnswer(-1, false); // -1 signifie "Timeout"
      }

    }, 50);

    return () => clearInterval(timer);
  }, [gameState, hasAnswered]); // Ajout de hasAnswered pour ne pas boucler

  // --- 4. ACTIONS ---
  const handleAnswer = async (index, isCorrect) => {
    if (hasAnswered || gameState.status !== "PLAYING") return;
    
    setHasAnswered(true);
    setMyAnswerIndex(index); // On mémorise mon choix pour la couleur rouge

    await axios.post('http://localhost:3001/api/game/answer', { 
        gameId, 
        userId, 
        answerIndex: index, 
        isCorrect 
    });
  };

  const handleQuit = () => {
      if (socketRef.current) socketRef.current.emit('leave_game');
      navigate('/home');
  };

  // --- 5. COMPOSANT TIMER CIRCULAIRE (RESTAURÉ) ---
  const CircularTimer = ({ time }) => {
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const progress = (time / 10) * circumference;
    
    // Logique Couleur
    let colorClass = "text-green-500";
    if (time <= 6) colorClass = "text-orange-500";
    if (time <= 3) colorClass = "text-red-500";

    return (
      <div className="relative flex items-center justify-center w-24 h-24">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="50%" cy="50%" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-gray-700" />
          <circle 
            cx="50%" cy="50%" r={radius} 
            stroke="currentColor" strokeWidth="6" fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            strokeLinecap="round"
            className={`transition-colors duration-200 ease-linear ${colorClass}`}
          />
        </svg>
        <span className={`absolute text-2xl font-black ${colorClass}`}>{Math.ceil(time)}</span>
      </div>
    );
  };

  // --- RENDUS ---
  if (!quiz || !gameState) return <div className="bg-gray-900 min-h-screen text-white flex items-center justify-center">Chargement...</div>;

  if (gameState.status === "WAITING") {
    return (
      <div className="bg-gray-900 min-h-screen text-white flex flex-col items-center justify-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-8"></div>
        <h2 className="text-2xl font-bold animate-pulse mb-4">En attente d'un adversaire...</h2>
        <button onClick={handleQuit} className="px-6 py-2 border border-gray-500 rounded-full text-gray-400 hover:text-white hover:border-white transition">
            Annuler la recherche
        </button>
      </div>
    );
  }

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
      
      {/* HEADER */}
      <div className="bg-gray-800 p-4 flex justify-between items-center h-28 z-10 relative shadow-lg">
        <button onClick={handleQuit} className="absolute left-4 top-4 text-gray-500 hover:text-white text-xs font-bold uppercase">← Quitter</button>

        <div className="w-1/3 text-right pr-4"><div className="text-xs text-blue-400 font-bold">MOI</div><div className="text-4xl font-black">{myScore}</div></div>
        
        {/* TIMER CIRCULAIRE RESTAURÉ */}
        <div className="w-1/3 flex justify-center">
            <CircularTimer time={timeLeft} />
        </div>

        <div className="w-1/3 text-left pl-4"><div className="text-xs text-red-400 font-bold">ADV.</div><div className="text-4xl font-black">{oppScore}</div></div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold text-center mb-10 max-w-4xl leading-snug">{currentQ.text}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          {currentQ.answers.map((ans, idx) => {
             
             // --- LOGIQUE COULEURS ---
             let style = "bg-gray-800 border-gray-600 hover:bg-gray-700";
             
             if (hasAnswered || gameState.status === "ROUND_SUMMARY") {
                 if (ans.isCorrect) {
                     // La bonne réponse toujours VERTE
                     style = "bg-green-600 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.4)]";
                 } 
                 else if (idx === myAnswerIndex && !ans.isCorrect) {
                     // Ma réponse si elle est FAUSSE -> ROUGE
                     style = "bg-red-600 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.4)]";
                 }
                 else {
                     // Les autres -> Grisé
                     style = "opacity-25 grayscale cursor-not-allowed";
                 }
             }
             // -------------------------

             return (
                <button key={idx} onClick={() => handleAnswer(idx, ans.isCorrect)} disabled={hasAnswered || gameState.status !== "PLAYING"} 
                    className={`p-8 rounded-2xl font-bold text-xl border-2 transition-all transform duration-200 ${style}`}>
                    {ans.text}
                </button>
             )
          })}
        </div>
        
        <div className="h-10 mt-12 flex items-center justify-center">
            {oppAnswerIndex !== null && gameState.status === "PLAYING" && (
                <div className={`px-4 py-1 rounded-full text-xs font-bold border flex gap-2 items-center animate-bounce ${isOpponentCorrect ? 'text-green-400 border-green-500 bg-green-900/30' : 'text-red-400 border-red-500 bg-red-900/30'}`}>
                    <span className="w-2 h-2 rounded-full bg-current"></span>
                    {isOpponentCorrect ? "L'adversaire a réussi !" : "L'adversaire a raté..."}
                </div>
            )}
        </div>
      </div>

      {gameState.status === "ROUND_SUMMARY" && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-300">
              <div className="bg-gray-800 p-8 rounded-3xl text-center max-w-sm w-full border border-gray-600 shadow-2xl transform scale-100 transition-all">
                  <h3 className="text-gray-400 text-xs font-bold uppercase mb-6 tracking-[0.2em]">Fin de la manche</h3>
                  <div className="flex justify-around items-end mb-8 bg-gray-700/30 p-4 rounded-xl">
                      <div><div className="text-blue-400 font-bold text-xs mb-1">MOI</div><div className={`text-4xl font-black ${myGain > 0 ? 'text-green-400' : 'text-gray-500'}`}>+{myGain}</div></div>
                      <div className="h-10 w-px bg-gray-600 mx-4"></div>
                      <div><div className="text-red-400 font-bold text-xs mb-1">ADV.</div><div className={`text-4xl font-black ${oppGain > 0 ? 'text-red-400' : 'text-gray-500'}`}>+{oppGain}</div></div>
                  </div>
                  <div className="text-white font-bold text-xl mb-4">Question suivante...</div>
                  <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden"><div className="h-full bg-blue-500 animate-[width_3s_linear_forwards] w-0"></div></div>
                  <style>{`@keyframes width { to { width: 100%; } }`}</style>
              </div>
          </div>
      )}
    </div>
  );
}