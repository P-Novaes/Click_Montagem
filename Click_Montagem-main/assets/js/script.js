// ── CALCULADORA DA HOME: alternar tipo de móvel e dropdown customizado ──
document.addEventListener('DOMContentLoaded', function () {
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    const options = document.querySelectorAll('#customOptions li[data-grupo]');
    const optgroupLabels = document.querySelectorAll('.optgroup-label');
    const customSelect = document.getElementById('customSelect');
    const customSelectTrigger = document.getElementById('customSelectTrigger');
    const customOptions = document.getElementById('customOptions');
    const hiddenInput = document.getElementById('tipoMovelHidden');
    const precoValor = document.getElementById('precoValor');
    const outroContainer = document.getElementById('outroContainer');
    const outroTexto = document.getElementById('outroTexto');

    // Só inicializa a calculadora se os elementos existirem na página atual (index.html)
    if (customSelect && customSelectTrigger && customOptions && hiddenInput) {
        let tipoAtual = 'planejado';

        function filtrarOpcoes(tipo) {
            optgroupLabels.forEach((label) => {
                label.style.display = label.dataset.grupo === tipo ? 'block' : 'none';
            });
            options.forEach((option) => {
                if (option.dataset.grupo === tipo) {
                    option.style.display = 'flex';
                } else {
                    option.style.display = 'none';
                    option.classList.remove('selected');
                }
            });
            const primeiro = document.querySelector(
                `#customOptions li[data-grupo="${tipo}"]:not(.optgroup-label)`
            );
            if (primeiro) {
                selecionarItem(primeiro, false);
            }
        }

        function selecionarItem(item, fechar = true) {
            if (!item || item.classList.contains('optgroup-label')) return;

            options.forEach((opt) => opt.classList.remove('selected'));
            item.classList.add('selected');

            const iconElement = item.querySelector('i');
            const iconHTML = iconElement ? iconElement.outerHTML : '';
            const nome = item.textContent.trim();

            const selIcon = customSelectTrigger.querySelector('.selected-icon');
            const selText = customSelectTrigger.querySelector('.selected-text');
            if (selIcon) selIcon.innerHTML = iconHTML;
            if (selText) selText.textContent = nome;

            hiddenInput.value = item.dataset.value;
            hiddenInput.dataset.preco = item.dataset.preco;

            atualizarPreco(item.dataset.preco, item.dataset.value);

            if (
                outroContainer &&
                item.dataset.value &&
                (item.dataset.value.includes('outro-plan') || item.dataset.value.includes('outro-pad'))
            ) {
                outroContainer.style.display = 'block';
            } else if (outroContainer) {
                outroContainer.style.display = 'none';
                if (outroTexto) outroTexto.value = '';
            }

            if (fechar) {
                customOptions.style.display = 'none';
                customSelectTrigger.classList.remove('open');
            }
        }

        function atualizarPreco(precoRange, value) {
            if (!precoValor) return;
            if (value && (value.includes('outro-plan') || value.includes('outro-pad'))) {
                precoValor.textContent = 'A combinar';
            } else if (precoRange && precoRange !== '0') {
                const [min, max] = precoRange.split('-');
                precoValor.textContent = `R$ ${min} – ${max}`;
            } else {
                precoValor.textContent = 'R$ 300 – 500';
            }
        }

        customSelectTrigger.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = customOptions.style.display === 'block';
            customOptions.style.display = isOpen ? 'none' : 'block';
            customSelectTrigger.classList.toggle('open', !isOpen);
        });

        document.addEventListener('click', function (e) {
            if (!customSelect.contains(e.target)) {
                customOptions.style.display = 'none';
                customSelectTrigger.classList.remove('open');
            }
        });

        customOptions.addEventListener('click', function (e) {
            const li = e.target.closest('li');
            if (!li || li.classList.contains('optgroup-label')) return;
            selecionarItem(li);
        });

        window.selecionarTipo = function (btn) {
            toggleBtns.forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            tipoAtual = btn.dataset.tipo;
            filtrarOpcoes(tipoAtual);
        };

        filtrarOpcoes('planejado');
    }
});

// ── MENU HAMBURGUER E ATUALIZAÇÃO DA HOME ──
document.addEventListener('DOMContentLoaded', async function () {
    const bindHamburger = () => {
        const hamburger = document.getElementById('hamburger');
        const mobileMenu = document.getElementById('mobileMenu');
        if (hamburger && mobileMenu && !hamburger.dataset.bound) {
            hamburger.dataset.bound = '1';
            hamburger.addEventListener('click', function () {
                mobileMenu.classList.toggle('active');
            });
        }
    };
    bindHamburger();

    if (typeof API !== 'undefined' && typeof Sessao !== 'undefined') {
        await Sessao.sincronizar();

        if (Sessao.logado()) {
            const painelUrl = Sessao.isMontador()
                ? '/pages/painel-montador.html'
                : '/pages/painel-cliente.html';

            const navRight = document.querySelector('.nav-right');
            if (navRight && !document.querySelector('.nav-avatar')) {
                navRight.innerHTML = `
                    <a href="${painelUrl}"><button class="btn btn-primary" type="button"><i class="fas fa-th-large"></i> Meu Painel</button></a>
                    <button class="btn btn-ghost" type="button" onclick="Sessao.logout()" style="margin-left:8px;"><i class="fas fa-sign-out-alt"></i> Sair</button>
                    <button class="nav-hamburger" id="hamburger"><span></span><span></span><span></span></button>
                `;
                bindHamburger();
            }

            const heroActions = document.querySelector('.hero-actions');
            if (heroActions) {
                heroActions.innerHTML = Sessao.isCliente()
                    ? `
                        <a href="/pages/orcamento.html" class="btn btn-primary btn-lg">Solicitar orçamento ↗</a>
                        <a href="${painelUrl}" class="btn btn-outline btn-lg">Ir para meu painel</a>
                    `
                    : `
                        <a href="${painelUrl}" class="btn btn-primary btn-lg">Acessar painel profissional ↗</a>
                        <a href="/pages/agenda.html" class="btn btn-outline btn-lg">Minha agenda</a>
                    `;
            }
        }

        // Carrega Montadores em Destaque do MongoDB na Home
        const gridMont = document.querySelector('.montadores-grid');
        if (gridMont) {
            API.montadores
                .listar()
                .then((res) => {
                    const lista = res.montadores || [];
                    if (lista.length > 0) {
                        const cores = ['av-amber', 'av-clay', 'av-warm'];
                        gridMont.innerHTML = lista
                            .slice(0, 3)
                            .map((m, idx) => {
                                const cor = cores[idx % cores.length];
                                const iniciais =
                                    typeof extrairIniciais === 'function'
                                        ? extrairIniciais(m.nome)
                                        : 'MO';
                                const esp = m.especialidades
                                    ? m.especialidades.split(',')[0].trim()
                                    : 'Montagem de móveis';
                                const nota = Number(m.nota_media || 5.0).toFixed(1);
                                const servicos = m.total_servicos || 0;

                                return `
                                    <div class="montador-card">
                                        <div class="avatar montador-avatar ${cor} av-xl">${iniciais}</div>
                                        <h4>${m.nome}</h4>
                                        <p class="especialidade">${esp}</p>
                                        <div class="avaliacao">
                                            <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                                            <span>${nota} (${servicos} serviços)</span>
                                        </div>
                                        <a href="/pages/perfil-montador.html?id=${encodeURIComponent(m.id)}" class="btn btn-ghost btn-full">Ver perfil</a>
                                    </div>
                                `;
                            })
                            .join('');
                    }
                })
                .catch((err) => console.warn('Falha ao listar montadores na home:', err));
        }
    }
});
