import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import CreateQuizPage from './pages/CreateQuizPage';
import GamePage from './pages/GamePage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        
        {/* Route par défaut (Login) */}
        <Route path="/" element={<LoginPage />} />
        
        {/* Route Dashboard */}
        <Route path="/home" element={<HomePage />} />

        <Route path="/create" element={<CreateQuizPage />} />

        {/* Si l'utilisateur tape n'importe quoi, on le renvoie à l'accueil */}
        <Route path="*" element={<Navigate to="/" />} />

        <Route path="/play/:id" element={<GamePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;