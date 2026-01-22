import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const navigate = useNavigate();
  
  // Par défaut, on se met sur TRUE (Mode Connexion) pour éviter ton erreur
  const [isLogin, setIsLogin] = useState(true);
  
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [message, setMessage] = useState('');

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("Chargement...");
    
    try {
      // C'est ici que la magie opère :
      // Si isLogin est vrai -> /api/login
      // Si isLogin est faux -> /api/register
      const endpoint = isLogin ? '/api/login' : '/api/register';
      const url = `http://localhost:3001${endpoint}`;
      
      const response = await axios.post(url, formData);
      
      if (isLogin) {
        // C'est une CONNEXION RÉUSSIE
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('username', response.data.username);
        localStorage.setItem('userId', response.data.userId);
        navigate('/home'); 
      } else {
        // C'est une INSCRIPTION RÉUSSIE
        setMessage("Compte créé ! Cliquez sur l'onglet Connexion pour entrer.");
        setIsLogin(true); // On bascule automatiquement sur l'onglet connexion
      }
    } catch (error) {
      setMessage("Erreur : " + (error.response?.data?.error || "Problème serveur"));
    }
  };

  return (
    // J'ai retiré le bg-gray-900 ici pour laisser voir ton fond #5B5353
    <div className="min-h-screen flex items-center justify-center font-sans p-4 w-full">
      
      <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 relative overflow-hidden">
        {/* Barre rouge déco */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-400"></div>

        <h1 className="text-4xl font-black mb-8 text-center text-white tracking-tighter">
          QUIZ<span className="text-red-500">APP</span>
        </h1>
        
        {/* LES ONGLETS (Le Switch) */}
        <div className="flex mb-6 bg-gray-900 p-1 rounded-lg border border-gray-700">
          <button 
            type="button" // Important pour ne pas soumettre le formulaire
            onClick={() => { setIsLogin(true); setMessage(''); }} 
            className={`flex-1 py-2 rounded-md text-sm font-bold transition ${isLogin ? 'bg-gray-700 text-white shadow ring-1 ring-gray-600' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Connexion
          </button>
          <button 
            type="button" 
            onClick={() => { setIsLogin(false); setMessage(''); }} 
            className={`flex-1 py-2 rounded-md text-sm font-bold transition ${!isLogin ? 'bg-gray-700 text-white shadow ring-1 ring-gray-600' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Inscription
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Le pseudo ne s'affiche que si on est en mode INSCRIPTION (!isLogin) */}
          {!isLogin && (
            <input 
              type="text" 
              name="username" 
              placeholder="Choisir un Pseudo" 
              value={formData.username} 
              onChange={handleChange} 
              required 
              className="p-3 bg-gray-700 border border-gray-600 rounded-lg focus:border-red-500 outline-none text-white placeholder-gray-400 transition" 
            />
          )}

          <input 
            type="email" 
            name="email" 
            placeholder="Votre Email" 
            value={formData.email} 
            onChange={handleChange} 
            required 
            className="p-3 bg-gray-700 border border-gray-600 rounded-lg focus:border-red-500 outline-none text-white placeholder-gray-400 transition" 
          />
          
          <input 
            type="password" 
            name="password" 
            placeholder="Mot de passe" 
            value={formData.password} 
            onChange={handleChange} 
            required 
            className="p-3 bg-gray-700 border border-gray-600 rounded-lg focus:border-red-500 outline-none text-white placeholder-gray-400 transition" 
          />
          
          <button 
            type="submit" 
            className="bg-red-600 hover:bg-red-500 text-white font-bold p-3 rounded-lg shadow-lg mt-2 transition duration-200"
          >
            {/* Le texte change dynamiquement */}
            {isLogin ? 'SE CONNECTER' : "CRÉER UN COMPTE"}
          </button>
        </form>

        {message && (
          <div className={`mt-6 p-3 rounded-lg text-center text-sm font-medium ${message.includes('Erreur') ? 'bg-red-900/50 text-red-200 border border-red-800' : 'bg-green-900/50 text-green-200 border border-green-800'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}