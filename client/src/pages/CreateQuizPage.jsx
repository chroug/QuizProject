import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const CATEGORIES = ["Général", "Cinéma", "Séries TV", "Jeux Vidéo", "Sport", "Histoire", "Sciences", "Musique", "Anime"];

export default function CreateQuizPage() {
  const navigate = useNavigate();
  
  // États du formulaire
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Général'); // Par défaut
  const [coverImage, setCoverImage] = useState(''); // URL de l'image
  
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState({
    text: '',
    timeLimit: 10,
    answers: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false },
      { text: '', isCorrect: false }
    ]
  });

  // Gestion des réponses
  const handleAnswerChange = (index, value) => {
    const newAnswers = [...currentQuestion.answers];
    newAnswers[index].text = value;
    setCurrentQuestion({ ...currentQuestion, answers: newAnswers });
  };

  const setCorrectAnswer = (index) => {
    const newAnswers = currentQuestion.answers.map((ans, i) => ({
      ...ans,
      isCorrect: i === index
    }));
    setCurrentQuestion({ ...currentQuestion, answers: newAnswers });
  };

  const addQuestion = () => {
    if (!currentQuestion.text) return alert("La question est vide !");
    setQuestions([...questions, currentQuestion]);
    setCurrentQuestion({
      text: '',
      timeLimit: 10,
      answers: [
        { text: '', isCorrect: true }, { text: '', isCorrect: false }, { text: '', isCorrect: false }, { text: '', isCorrect: false }
      ]
    });
  };

  const submitQuiz = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) return alert("Reconnecte-toi !");
    if (questions.length === 0) return alert("Ajoute au moins une question !");

    // Si pas d'image, on en met une par défaut selon la catégorie (astuce sympa)
    const finalImage = coverImage || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop";

    try {
      await axios.post('http://localhost:3001/api/quizzes', {
        title,
        description,
        category,
        coverImage: finalImage,
        creatorId: userId,
        questions
      });
      alert("Quiz publié !");
      navigate('/home');
    } catch (error) {
      console.error(error);
      alert("Erreur serveur");
    }
  };

  return (
    <div className="min-h-screen p-6 font-sans w-full text-white pt-20">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-black text-red-500 mb-8">CRÉER UN QUIZ</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* COLONNE GAUCHE : Infos */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 space-y-4">
            <h2 className="text-xl font-bold text-gray-300">1. Informations</h2>
            
            <input 
              className="w-full bg-gray-900 p-3 rounded border border-gray-600 focus:border-red-500 outline-none text-white font-bold" 
              placeholder="Titre du Quiz"
              value={title} onChange={(e) => setTitle(e.target.value)}
            />
            
            <div className="flex gap-2">
              <select 
                value={category} 
                onChange={(e) => setCategory(e.target.value)}
                className="bg-gray-900 p-3 rounded border border-gray-600 text-white flex-1"
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            <input 
              className="w-full bg-gray-900 p-3 rounded border border-gray-600 text-sm" 
              placeholder="URL de l'image de couverture (http://...)"
              value={coverImage} onChange={(e) => setCoverImage(e.target.value)}
            />
             {/* Prévisualisation de l'image */}
             {coverImage && <img src={coverImage} alt="Cover" className="w-full h-32 object-cover rounded-lg mt-2 opacity-80" />}
            
            <textarea 
              className="w-full bg-gray-900 p-3 rounded border border-gray-600 text-sm h-24" 
              placeholder="Description..."
              value={description} onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* COLONNE DROITE : Questions */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-red-500 blur-3xl opacity-20"></div>
            <h2 className="text-xl font-bold text-gray-300 mb-4">2. Ajouter une Question</h2>
            
            <input 
              className="w-full bg-gray-900 p-3 rounded mb-3 border border-gray-600 focus:border-red-500 outline-none"
              placeholder="Intitulé de la question..."
              value={currentQuestion.text} onChange={(e) => setCurrentQuestion({...currentQuestion, text: e.target.value})}
            />

            <div className="space-y-2 mb-4">
              {currentQuestion.answers.map((answer, index) => (
                <div key={index} className="flex items-center gap-2">
                   <div 
                    onClick={() => setCorrectAnswer(index)}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer flex items-center justify-center ${answer.isCorrect ? 'border-green-500 bg-green-500' : 'border-gray-500'}`}
                   >
                     {answer.isCorrect && <span className="text-white text-xs">✓</span>}
                   </div>
                  <input 
                    className={`flex-1 p-2 rounded border outline-none text-sm ${answer.isCorrect ? 'bg-green-900/30 border-green-500/50 text-green-100' : 'bg-gray-900 border-gray-600'}`}
                    placeholder={`Réponse ${index + 1}`}
                    value={answer.text} onChange={(e) => handleAnswerChange(index, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <button onClick={addQuestion} className="w-full bg-gray-600 hover:bg-gray-500 py-2 rounded font-bold transition">+ Ajouter ({questions.length} prêtes)</button>
          </div>
        </div>

        <button onClick={submitQuiz} className="w-full bg-red-600 hover:bg-red-500 py-4 rounded-xl font-black text-xl shadow-lg hover:shadow-red-500/20 transition transform hover:scale-[1.01]">
          PUBLIER LE QUIZ MAINTENANT
        </button>
        
        <button onClick={() => navigate('/home')} className="w-full mt-4 text-center text-gray-500 hover:text-gray-300">Annuler</button>
      </div>
    </div>
  );
}