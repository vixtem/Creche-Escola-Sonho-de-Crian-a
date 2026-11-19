import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, ArrowRight, Sparkles, Menu, X, ChevronDown, Check, Copy, MessageCircle, MapPin, Clock, MoveUpRight } from 'lucide-react';
import { school } from './school';
import './styles.css';

const asset = (name) => `${import.meta.env.BASE_URL}images/${name}`;
const links = [['Vivências', 'vivencias']];

function Brand({ footer = false }) {
  return (
    <a className={`brand ${footer ? 'brand-footer' : ''}`} href="#inicio" aria-label="Creche Escola Sonho de Criança — início">
      <img src={asset('marca-cesc.png')} width="600" height="365" alt="" />
    </a>
  );
}
const experiences = [
  { image: 'festa-anos-80-dupla.webp', label: 'Duas crianças fantasiadas no tapete colorido da festa anos 80' },
  { image: 'festa-anos-80-oculos.webp', label: 'Criança de óculos brancos diante do painel do Dia das Crianças' },
  { image: 'festa-anos-80-bandana.webp', label: 'Criança de bandana vermelha e jaqueta jeans no cenário da festa' },
];

function Flower({ className = '' }) {
  return <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true"><path d="M50 28C20-10-10 23 28 50-10 78 23 110 50 72c28 38 60 5 22-22 38-28 5-60-22-22Z" fill="currentColor"/><circle cx="50" cy="50" r="13" fill="#fff9eb"/><path d="M44 49h1m11 0h1m-12 7q6 6 12 0" stroke="#102a67" strokeWidth="3" strokeLinecap="round"/></svg>;
}
function App() {
  const [menu, setMenu] = useState(false);
  const [gallery, setGallery] = useState(null);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const closeRef = useRef(null);
  const openerRef = useRef(null);

  useEffect(() => {
    if (gallery === null) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const key = e => { if (e.key === 'Escape') setGallery(null); if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus(); } };
    window.addEventListener('keydown', key);
    return () => { document.body.style.overflow = old; window.removeEventListener('keydown', key); openerRef.current?.focus(); };
  }, [gallery]);

  function prepareContact(e) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const text = `Olá! Gostaria de conhecer a ${school.fullName}. Meu nome é ${data.get('name')}. Tenho interesse para uma criança de ${data.get('age')} anos. ${data.get('note') || ''}`;
    setMessage(text); setSubmitted(true); setCopied(false);
  }
  async function copyMessage() {
    try { await navigator.clipboard.writeText(message); setCopied(true); }
    catch { setCopied(false); }
  }

  return <>
    <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
    <div className="topline"><span>Pequenas descobertas. Grandes começos.</span><span><span className="status-dot"/> Educação infantil · 2 a 5 anos</span></div>
    <header><div className="nav-wrap"><Brand/><nav id="main-navigation" aria-label="Menu principal" className={menu ? 'is-open' : ''}>{links.map(([label, id]) => <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>{label}</a>)}<a href={school.instagram} target="_blank" rel="noreferrer" onClick={() => setMenu(false)}>Instagram</a><a className="button small nav-contact" href="#contato" onClick={() => setMenu(false)}>Vamos conversar <ArrowUpRight size={17}/></a></nav><button className="menu-toggle" aria-label={menu ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menu} aria-controls="main-navigation" onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></div></header>
    <main id="conteudo">
      <section id="inicio" className="home-banner section-wrap" aria-labelledby="home-title">
        <div className="home-banner-copy">
          <span className="eyebrow">Educação infantil · 2 a 5 anos</span>
          <h1 id="home-title">Pequenos passos.<br/><span>Descobertas gigantes.</span></h1>
          <p>Uma infância com espaço para brincar, imaginar e crescer.</p>
          <a className="text-link" href="#contato">Conheça a escola <ArrowRight size={18} aria-hidden="true" /></a>
        </div>
        <img
          className="home-banner-photo"
          src={asset('festa-anos-80-capa.webp')}
          width="360"
          height="640"
          fetchPriority="high"
          alt="Criança de vestido branco na festa anos 80 da escola"
        />
      </section>
      <section className="home-enrollment section-wrap" aria-labelledby="enrollment-banner-title">
        <a className="home-enrollment-link" href="./portal.html">
          <div>
            <h2 id="enrollment-banner-title">Pré-matrícula</h2>
            <p>Entre no Portal da Família para fazer a pré-matrícula ou acompanhar sua solicitação.</p>
          </div>
          <span>Acessar Portal da Família <ArrowUpRight size={19} aria-hidden="true" /></span>
        </a>
      </section>
      <div className="values-ribbon" aria-label="Valores que inspiram este projeto"><div><span>Aprender brincando</span><Sparkles/><span>Crescer com afeto</span><Sparkles/><span>Imaginar sem limites</span><Sparkles/><span>Descobrir o mundo</span><Sparkles/></div></div>
      <section id="vivencias" className="section-wrap section-space experiences">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Vivências</span>
            <h2>É brincando que o<br/>mundo fica <span className="coral-text">maior.</span></h2>
          </div>
          <p>Festa anos 80 na Creche Escola Sonho de Criança</p>
        </div>
        <div className="experience-grid">
          {experiences.map(({ image, label }) => (
            <button
              key={image}
              className="experience-card"
              onClick={event => { openerRef.current = event.currentTarget; setGallery({ image, label }); }}
              aria-label={`Ampliar imagem: ${label}`}
            >
              <span className="experience-photo">
                <img src={asset(image)} width="360" height="640" loading="lazy" alt="" />
                <span className="expand-icon"><MoveUpRight size={20} aria-hidden="true" /></span>
              </span>
            </button>
          ))}
        </div>
        <a className="text-link experience-instagram" href={school.instagram} target="_blank" rel="noreferrer">
          Mais registros no Instagram <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </section>
      <section className="faq-section section-wrap section-space"><div><span className="eyebrow">PARA AS FAMÍLIAS</span><h2>Uma boa conversa<br/>é o primeiro passo.</h2><p>Reunimos algumas informações para<br/>começar a conhecer a escola.</p><Flower className="faq-flower"/></div><div className="faq-list">{[['Qual a faixa etária da escola?','Este projeto apresenta a Creche Escola Sonho de Criança para famílias com crianças de 2 a 5 anos. A distribuição das turmas deve ser confirmada com a secretaria.'],['Como conhecer a escola?','Use a seção de contato para preparar sua mensagem de interesse. O contato oficial da secretaria será incluído assim que for confirmado.'],['Quais são os horários e turnos?','Os horários de funcionamento e os turnos disponíveis ainda serão informados pela direção. Assim que confirmados, estarão disponíveis aqui.'],['Estas são fotos reais da escola?','Sim. As imagens mostram crianças da escola na festa anos 80 e foram publicadas no Instagram oficial.']].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={20}/></summary><p>{answer}</p></details>)}</div></section>
      <section id="contato" className="contact-section"><div className="section-wrap contact-layout"><div><span className="eyebrow">VAMOS NOS CONHECER?</span><h2>Todo grande sonho<br/>começa com um<br/><span>pequeno olá.</span></h2><p>Conte em qual fase sua criança está.<br/>Vamos preparar o começo dessa conversa.</p><div className="contact-info"><span><MapPin size={18}/>{school.address || 'Endereço em atualização'}</span><span><Clock size={18}/>{school.hours || 'Horários a confirmar com a secretaria'}</span></div></div><div className="contact-form-wrap"><h3>O primeiro passo é seu.</h3><p className="form-intro">Prepare uma mensagem para a secretaria.</p><form onSubmit={prepareContact}><label htmlFor="name">Seu nome</label><input id="name" name="name" placeholder="Como podemos chamar você?" required maxLength={100} autoComplete="given-name" onChange={() => setSubmitted(false)}/><label htmlFor="age">Idade da criança</label><select id="age" name="age" required defaultValue="" onChange={() => setSubmitted(false)}><option value="" disabled>Selecione a idade</option>{[2,3,4,5].map(a => <option key={a} value={a}>{a} anos</option>)}</select><label htmlFor="note">Quer contar algo mais? <span>(opcional)</span></label><textarea id="note" name="note" placeholder="Uma dúvida ou o que você gostaria de conhecer…" maxLength={800} rows={2} onChange={() => setSubmitted(false)}/><button className="button" type="submit">Preparar minha mensagem <ArrowUpRight size={18}/></button><p className="form-note">Nenhum dado é enviado ou salvo por este formulário.</p></form>{submitted && <div className="message-result" role="status"><strong>Mensagem pronta!</strong><textarea aria-label="Mensagem preparada para copiar" readOnly value={message} rows={4}/>{school.whatsapp ? <a className="text-link" href={`https://wa.me/${school.whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle size={18}/> Continuar no WhatsApp</a> : <><p>O WhatsApp oficial ainda será cadastrado. Você pode copiar a mensagem, mas ela ainda não foi enviada.</p><button className="text-link" onClick={copyMessage}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? 'Mensagem copiada' : 'Copiar mensagem'}</button></>}</div>}</div></div></section>
    </main>
    <footer className="section-wrap"><div className="footer-top"><Brand footer/><span>Infância para viver.<br/><strong>Sonhos para levar.</strong></span><a href="#inicio" className="back-top">Voltar ao topo <ArrowUpRight size={19}/></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} {school.fullName}.</span><span>Primeira versão · Conteúdo institucional em validação</span><a href="./portal.html">Portal da família</a><a href="./portal.html?area=secretaria">Secretaria</a><a href="#contato">Fale com a escola</a><a href={school.instagram} target="_blank" rel="noreferrer">Instagram</a></div></footer>
    {gallery !== null && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setGallery(null)}><button ref={closeRef} className="lightbox-close" aria-label="Fechar imagem" onClick={() => setGallery(null)}><X/></button><div className="lightbox-content" onClick={e => e.stopPropagation()}><img src={asset(gallery.image)} width="360" height="640" alt={gallery.label} /></div></div>}
  </>;
}

createRoot(document.getElementById('root')).render(<App/>);
