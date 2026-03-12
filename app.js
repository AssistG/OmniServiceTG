// Gestion de la navigation et affichage des sections
function showSection(sectionId) {
    // Masquer toutes les sections
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    // Afficher la section demandée
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.add('active');
    }
    
    // Réinitialiser le hash pour éviter les conflits
    if (sectionId === 'services') {
        history.replaceState(null, null, ' ');
    }
}

// Gestion des détails de service
function showServiceDetail(serviceId) {
    showSection(serviceId);
    window.location.hash = serviceId;
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    
    // Navigation principale
    const navLinks = document.querySelectorAll('nav a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation(); // CORRECTION: Empêcher la propagation
            const sectionId = this.getAttribute('href').substring(1);
            showSection(sectionId);
            
            // Mettre à jour les liens actifs
            navLinks.forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
    
    // Cartes de services - Navigation vers les détails
    const serviceCards = document.querySelectorAll('.service-card');
    serviceCards.forEach(card => {
        // Retirer les anciens listeners pour éviter les doublons
        const newCard = card.cloneNode(true);
        card.parentNode.replaceChild(newCard, card);
        
        newCard.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation(); // CORRECTION: Empêcher la propagation
            const serviceId = this.getAttribute('data-service');
            if (serviceId) {
                showServiceDetail(serviceId);
            }
        });
    });
    
    // Boutons "Retour" dans les pages de détails
    const backButtons = document.querySelectorAll('.back-to-services');
    backButtons.forEach(button => {
        // Retirer les anciens listeners pour éviter les doublons
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation(); // CORRECTION: Empêcher la propagation
            e.stopImmediatePropagation(); // CORRECTION: Arrêter tous les listeners
            
            // Réinitialiser le hash
            window.location.hash = '';
            history.replaceState(null, null, ' ');
            
            // Retourner à la section services
            showSection('services');
            
            // S'assurer que le lien "Services" est actif dans la navigation
            navLinks.forEach(l => l.classList.remove('active'));
            const servicesLink = document.querySelector('nav a[href="#services"]');
            if (servicesLink) {
                servicesLink.classList.add('active');
            }
            
            return false; // CORRECTION: Empêcher toute action par défaut
        });
    });
    
    // Gestion du hash dans l'URL au chargement
    const hash = window.location.hash.substring(1);
    if (hash) {
        const validSections = ['home', 'services', 'about', 'contact', 'restaurant', 'immobilier', 'transport', 'evenementiel'];
        if (validSections.includes(hash)) {
            showSection(hash);
        } else {
            showSection('home');
        }
    } else {
        showSection('home');
    }
    
    // Écouter les changements de hash
    window.addEventListener('hashchange', function(e) {
        e.preventDefault();
        e.stopPropagation(); // CORRECTION: Empêcher la propagation
        
        const newHash = window.location.hash.substring(1);
        if (newHash) {
            showSection(newHash);
        }
    });
    
    // Formulaire de contact
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            e.stopPropagation(); // CORRECTION: Empêcher la propagation
            
            // Récupérer les données du formulaire
            const formData = new FormData(this);
            const data = Object.fromEntries(formData);
            
            // Ici vous pouvez ajouter votre logique d'envoi
            console.log('Données du formulaire:', data);
            
            // Afficher un message de confirmation
            alert('Merci pour votre message ! Nous vous contacterons bientôt.');
            
            // Réinitialiser le formulaire
            this.reset();
        });
    }
    
    // Animation au scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fade-in');
            }
        });
    }, observerOptions);
    
    // Observer les éléments à animer
    const animatedElements = document.querySelectorAll('.service-card, .feature-card');
    animatedElements.forEach(el => observer.observe(el));
});

// Fonction pour empêcher les clics multiples rapides
let navigationLocked = false;
function lockNavigation() {
    if (navigationLocked) return true;
    navigationLocked = true;
    setTimeout(() => {
        navigationLocked = false;
    }, 300);
    return false;
}
