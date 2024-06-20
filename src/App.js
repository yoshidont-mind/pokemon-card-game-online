// src/App.js
import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './components/Home';
import Session from './components/Session';
import Join from './components/Join';
import PokemonTest from './components/PokemonTest';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/home" element={<Home />} />
                <Route path="/session" element={<Session />} />
                <Route path="/join" element={<Join />} />
                <Route path="/pokemon" element={<PokemonTest />} />
            </Routes>
        </Router>
    );
}

export default App;
