import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function HomePage() {
  const navigate = useNavigate();
  const [userPseudo, setUserPseudo] = useState('');
  const [quizzes, setQuizzes] = useState([]); // Tous les quiz
  const [loading, setLoading] = useState(true);

  // Charger les données
  useEffect(() => {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    if (!token) {
      navigate('/');
    } else {
      setUserPseudo(username || 'Joueur');
      fetchQuizzes();
    }
  }, [navigate]);

  const fetchQuizzes = async () => {
    try {
      const res = await axios.get('http://localhost:3001/api/quizzes');
      setQuizzes(res.data);
      setLoading(false);
    } catch (error) {
      console.error("Erreur chargement", error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    navigate('/');
  };

  // --- COMPOSANT : RANGÉE NETFLIX ---
  // Affiche une catégorie et ses quiz en défilement horizontal
  const QuizRow = ({ title, category }) => {
    const filteredQuizzes = category === 'All' 
      ? quizzes 
      : quizzes.filter(q => q.category === category);

    if (filteredQuizzes.length === 0) return null;

    return (
      <div className="mb-8 pl-6">
        <h3 className="text-xl font-bold text-gray-100 mb-3 flex items-center gap-2">
           <span className="w-1 h-6 bg-red-600 rounded-full block"></span>
           {title}
        </h3>
        
        {/* La zone de défilement horizontal */}
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x">
          {filteredQuizzes.map((quiz) => (
            <div 
              key={quiz.id} 
              onClick={() => navigate(`/play/${quiz.id}`)}
              // LE FIX EST ICI 👇 : "flex-none" empêche l'agrandissement, "w-64" fixe la largeur
              className="flex-none w-64 h-40 bg-gray-800 rounded-lg overflow-hidden relative group cursor-pointer hover:scale-105 transition duration-300 shadow-lg snap-start border border-gray-700 hover:border-red-500"
            >
              {/* Image : "object-cover" force l'image à remplir la case sans déborder */}
              <img 
                src={quiz.coverImage || "https://via.placeholder.com/300x200?text=Quiz"} 
                alt={quiz.title} 
                className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition"
              />
              
              {/* Texte par-dessus */}
              <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-black to-transparent">
                <h4 className="font-bold text-white text-lg leading-tight drop-shadow-md truncate">{quiz.title}</h4>
                <p className="text-xs text-gray-300 mt-1">{quiz.questions?.length || 0} questions</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen font-sans text-gray-100 w-full pb-20">
      
      {/* Navbar Transparente / Sticky */}
      <nav className="bg-gray-900/90 backdrop-blur-md border-b border-gray-800 p-4 flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-2xl font-black text-red-600 tracking-tighter cursor-pointer">
          QUIZ<span className="text-white">UP</span>
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/create')} className="bg-gray-800 hover:bg-gray-700 text-sm px-4 py-2 rounded-full font-bold transition border border-gray-600">
             + Créer
          </button>
          <div className="w-8 h-8 rounded bg-red-600 flex items-center justify-center font-bold text-sm">
            {userPseudo.charAt(0).toUpperCase()}
          </div>
          <button onClick={handleLogout} className="text-gray-400 hover:text-white text-sm">Sortir</button>
        </div>
      </nav>

      {/* Hero Banner (Le quiz en vedette) */}
      <div className="relative w-full h-[50vh] bg-gray-800 mb-6 flex items-end">
        <img 
            src="https://images.unsplash.com/photo-1574267432553-4b4628081c31?q=80&w=1931&auto=format&fit=crop" 
            className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#5B5353] via-transparent to-transparent"></div>
        <div className="relative p-8 max-w-2xl">
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-wider">Tendance</span>
            <h2 className="text-5xl font-black text-white mt-2 mb-4 drop-shadow-lg">LE GRAND QUIZ</h2>
            <p className="text-gray-200 text-lg mb-6 drop-shadow-md">Teste tes connaissances générales dans ce mode survie. Combien de temps tiendras-tu ?</p>
            <button className="bg-white text-black px-8 py-3 rounded font-bold hover:bg-gray-200 transition flex items-center gap-2">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                JOUER MAINTENANT
            </button>
        </div>
      </div>

      {/* Les rangées Netflix */}
      <div className="-mt-10 relative z-10 space-y-2">
        {/* On affiche d'abord les plus récents */}
        <QuizRow title="Ajoutés récemment" category="All" />
        
        {/* Puis par catégorie */}
        <QuizRow title="🎬 Cinéma & Films" category="Cinéma" />
        <QuizRow title="📺 Séries TV" category="Séries TV" />
        <QuizRow title="🎮 Jeux Vidéo" category="Jeux Vidéo" />
        <QuizRow title="⚽ Sports" category="Sport" />
        <QuizRow title="🧠 Sciences & Savoir" category="Sciences" />
        <QuizRow title="🎵 Musique" category="Musique" />
      </div>

      {loading && <div className="text-center p-10 text-gray-500">Chargement des quiz...</div>}
      {!loading && quizzes.length === 0 && (
        <div className="text-center p-20 text-gray-400">
            Aucun quiz disponible. <br/> Sois le premier à en créer un !
        </div>
      )}

    </div>
  );
}