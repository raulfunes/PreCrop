import type { AccionDemo, EstadoDemo } from '@/types';
import {
  DEMO,
  FONDOS_NO_USADOS,
  getCondicionLote,
  getFinanzasIniciales,
  eventoAporte,
  eventoDesembolso,
  eventoRechazo,
  eventoRepago,
  getScenarioData
} from '@/data/fixtures';
import { calcularCupoSimulado, calcularMedianaMalezas } from '@/lib/scoreUtils';

export function getEstadoInicial(): EstadoDemo {
  const initialScenario = 'bueno';
  const weedsPct = calcularMedianaMalezas({}, initialScenario);
  const condicion = getCondicionLote(initialScenario, weedsPct);

  return {
    scenario: initialScenario,
    visionResults: {},
    paso: 'lote_evaluado',
    condicion,
    finanzas: getFinanzasIniciales(condicion.score),
    historial: [{
      id: 'ev-001',
      tipo: 'actualizacion-condicion',
      fecha: getScenarioData(initialScenario).fecha,
      descripcion: 'Condición del lote evaluada a partir de imágenes satelitales.',
      scoreNuevo: condicion.score,
      motivo: condicion.motivoPrincipal,
    }],
    rechazo: null,
  };
}

export function demoReducer(estado: EstadoDemo, accion: AccionDemo): EstadoDemo {
  switch (accion.tipo) {
    case 'CHANGE_SCENARIO': {
      const newScenario = accion.payload;
      const emptyResults = {};
      const weedsPct = calcularMedianaMalezas(emptyResults, newScenario);
      const newCondicion = getCondicionLote(newScenario, weedsPct, estado.condicion.score);
      const newCupo = calcularCupoSimulado(estado.finanzas.cosechaEstimadaBase, newCondicion.score);

      return {
        ...estado,
        scenario: newScenario,
        visionResults: emptyResults,
        condicion: newCondicion,
        finanzas: { ...estado.finanzas, cupoSimulado: newCupo }
      };
    }

    case 'LIMPIAR_RESULTADOS': {
      const emptyResults = {};
      const weedsPct = calcularMedianaMalezas(emptyResults, estado.scenario);
      const newCondicion = getCondicionLote(estado.scenario, weedsPct, estado.condicion.score);
      const newCupo = calcularCupoSimulado(estado.finanzas.cosechaEstimadaBase, newCondicion.score);
      return {
        ...estado,
        visionResults: emptyResults,
        condicion: newCondicion,
        finanzas: { ...estado.finanzas, cupoSimulado: newCupo }
      };
    }

    case 'INICIAR_ANALISIS': {
      const newResults = {
        ...estado.visionResults,
        [accion.payload.pointId]: { status: 'analyzing' as const, result: null }
      };
      return {
        ...estado,
        visionResults: newResults
      };
    }

    case 'ERROR_ANALISIS': {
      const newResults = {
        ...estado.visionResults,
        [accion.payload.pointId]: { status: 'error' as const, result: null, error: accion.payload.error }
      };
      return {
        ...estado,
        visionResults: newResults
      };
    }

    case 'PHOTO_UPLOADED': {
      const newResults = {
        ...estado.visionResults,
        [accion.payload.pointId]: { status: 'completed' as const, result: accion.payload }
      };
      const newWeeds = calcularMedianaMalezas(newResults, estado.scenario);
      let newCondicion = estado.condicion;
      let newFinanzas = estado.finanzas;

      newCondicion = getCondicionLote(estado.scenario, newWeeds, estado.condicion.score);
      newFinanzas = {
        ...estado.finanzas,
        cupoSimulado: calcularCupoSimulado(estado.finanzas.cosechaEstimadaBase, newCondicion.score)
      };

      return {
        ...estado,
        visionResults: newResults,
        condicion: newCondicion,
        finanzas: newFinanzas
      };
    }

    case 'APORTAR_FONDOS': {
      if (estado.paso !== 'lote_evaluado') return estado;
      return {
        ...estado,
        paso: 'fondos_aportados',
        finanzas: { ...estado.finanzas, fondosAportados: DEMO.APORTE_USD, fondosDisponibles: DEMO.APORTE_USD },
        historial: [...estado.historial, eventoAporte],
        rechazo: null,
      };
    }

    case 'REALIZAR_DESEMBOLSO': {
      if (estado.paso !== 'fondos_aportados') return estado;
      return {
        ...estado,
        paso: 'primer_desembolso',
        finanzas: { ...estado.finanzas, capitalDesembolsado: DEMO.PRIMER_DESEMBOLSO_USD, fondosDisponibles: FONDOS_NO_USADOS },
        historial: [...estado.historial, eventoDesembolso],
        rechazo: null,
      };
    }

    case 'ACTUALIZAR_CONDICION': {
      if (estado.paso !== 'primer_desembolso') return estado;
      const newScenario = 'malo';
      const weedsPct = calcularMedianaMalezas({}, newScenario);
      const newCondicion = getCondicionLote(newScenario, weedsPct, estado.condicion.score);
      const newCupo = calcularCupoSimulado(estado.finanzas.cosechaEstimadaBase, newCondicion.score);

      return {
        ...estado,
        scenario: newScenario,
        paso: 'condicion_actualizada',
        condicion: newCondicion,
        finanzas: { ...estado.finanzas, cupoSimulado: newCupo },
        historial: [...estado.historial, {
          id: 'ev-004',
          tipo: 'actualizacion-condicion',
          fecha: getScenarioData(newScenario).fecha,
          descripcion: 'Condición del lote actualizada. Score por debajo del umbral.',
          scoreAnterior: estado.condicion.score,
          scoreNuevo: newCondicion.score,
          motivo: 'Simulación de caída de score.',
        }],
        rechazo: null,
      };
    }

    case 'INTENTAR_SEGUNDO_DESEMBOLSO': {
      if (estado.paso !== 'condicion_actualizada') return estado;

      if (estado.condicion.estado === 'rojo' || estado.condicion.estado === 'sin-datos') {
        const rechazo = `El score bajó a ${estado.condicion.score}/100. La regla de la demo bloquea nuevos desembolsos por debajo de 50.`;
        return {
          ...estado,
          paso: 'segundo_desembolso_rechazado',
          historial: [...estado.historial, { ...eventoRechazo, motivo: rechazo }],
          rechazo,
        };
      } else {
        // En un caso real sin demo esto avanzaría, pero no lo bloqueamos falsamente.
        // As it's a demo, this state shouldn't happen based on instructions, but if it does, return untouched or move paso.
        return estado;
      }
    }

    case 'COMPLETAR_REPAGO': {
      if (estado.paso !== 'segundo_desembolso_rechazado') return estado;
      return {
        ...estado,
        paso: 'repago_completado',
        historial: [...estado.historial, eventoRepago],
        rechazo: null,
      };
    }

    case 'REINICIAR_DEMO':
      return getEstadoInicial();

    default:
      return estado;
  }
}
