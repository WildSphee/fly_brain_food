// Literature annotations are type/family-level context, not validated behavior
// of an individual MaleCNS body or a mapping into the simulated fly's actuators.
interface Role {
  title: string;
  description: string;
  evidence: string;
  source?: { label: string; url: string };
}
const escapeSource = {
  label: "Dombrovski et al., 2023",
  url: "https://www.nature.com/articles/s41586-022-05562-8",
};
const descendingRoles: Record<string, Role> = {
  DNp01: {
    title: "Rapid escape takeoff · giant fiber",
    description: "Drives the fast jump-and-flight escape pathway.",
    evidence: "Type-level study",
    source: escapeSource,
  },
  DNp04: {
    title: "Escape takeoff coordination",
    description:
      "Coactivation with DNp02 promotes backward body shifts and takeoff; this is a coordinated escape role.",
    evidence: "Type-level study",
    source: escapeSource,
  },
  DNg74_a: {
    title: "Leg sensory-feedback modulation",
    description:
      "DNg74 provides inhibitory input to leg feedback circuits. The study does not separately assign this _a subtype to a specific leg.",
    evidence: "DNg74 family-level study",
    source: {
      label: "Dallmann et al., 2025",
      url: "https://faculty.washington.edu/tuthill/docs/Dallmann_et_al-2025-Nature.pdf",
    },
  },
};

const pheromoneRelay: Role = {
  title: "Contact-pheromone pathway",
  description:
    "Ventral nerve cord → brain. This family receives input from putative pheromone-sensing taste neurons. A specific movement or leg assignment is not established for this subtype.",
  evidence: "Family-level connectivity · preprint",
  source: {
    label: "Berg et al. · MaleCNS study",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12636603/",
  },
};
const ascendingRoles: Record<string, Role> = {
  AN05B102a: pheromoneRelay,
  AN05B102c: pheromoneRelay,
  AN05B023a: pheromoneRelay,
  AN13B002: {
    title: "Body chemosensory feedback",
    description:
      "Ventral nerve cord → brain. Receives input from body chemosensory groups SNch07, SNch09 and SNch12. The exact taste quality and behavioral effect remain unassigned here.",
    evidence: "Type-level connectivity",
    source: {
      label: "Marin et al. · MANC study",
      url: "https://elifesciences.org/reviewed-preprints/97766",
    },
  },
};

export function neuronClass(group: string): string {
  return (
    {
      descending_neuron: "Descending",
      ascending_neuron: "Ascending",
      cb_sensory: "Sensory",
      visual_projection: "Visual projection",
      cb_intrinsic: "Brain interneuron",
      vnc_intrinsic: "VNC interneuron",
    }[group] || group.replaceAll("_", " ")
  );
}

export function neuronRole(n: {
  type: string;
  group: string;
  modality: string | null;
}): Role {
  if (n.group === "ascending_neuron")
    return (
      ascendingRoles[n.type] || {
        title: "Body-to-brain feedback · signal unassigned",
        description:
          "Carries information from the ventral nerve cord toward the brain. No specific sensory signal or behavioral role is established in the sources reviewed here.",
        evidence: "Circuit class only",
      }
    );
  if (n.group === "descending_neuron")
    return (
      descendingRoles[n.type] || {
        title: "Specific motor role unassigned",
        description:
          "Brain → ventral nerve cord. No specific movement or limb assignment in the sources reviewed for this viewer.",
        evidence: "Circuit class only",
      }
    );
  const descriptions: Record<string, [string, string]> = {
    ascending_neuron: [
      "Body-to-brain pathway",
      "Carries information from the ventral nerve cord toward the brain.",
    ],
    cb_intrinsic: [
      "Local brain processing",
      "An interneuron within the brain; no direct limb-control assignment.",
    ],
    vnc_intrinsic: [
      "Local nerve-cord processing",
      "An interneuron within the ventral nerve cord; no specific movement assigned here.",
    ],
    visual_projection: [
      "Visual pathway",
      "Relays visual information from the optic lobe toward central brain circuits.",
    ],
    cb_sensory: [
      `${({ olfactory: "Smell", taste: "Taste", thermal: "Temperature" } as Record<string, string>)[n.modality || ""] || "Sensory"} input`,
      "Sensory input to brain circuits; not a descending motor command.",
    ],
  };
  const [title, description] = descriptions[n.group] || [
    "Role unassigned",
    "No functional annotation available.",
  ];
  return {
    title,
    description,
    evidence: "Circuit class / modality annotation",
  };
}
