Python
R
The neuprint-python package provides a Python interface to the neuPrint API.

pip install neuprint-python
Next, go to neuPrint and create an account. Follow these instructions for getting your API token.

from neuprint import Client
client = Client("https://neuprint.janelia.org", dataset='male-cns:v1.0', token=token)

# Get neuron annotations and neuropil innervation
from neuprint import fetch_neurons
neurons, syndist = fetch_neurons("DNge104")

# Get connectivity
from neuprint import fetch_adjacencies
outgoing_edges, neuron_info = fetch_adjacencies("DNge104")
incoming_edges, neuron_info2 = fetch_adjacencies(None, "DNge104")
For more examples, please see the neuPrint Github repository.

If you want to work with neuron morphology, consider using navis. It wraps the neuprint-python interface and adds functions to read skeletons and meshes as navis objects which you can then use for visualization and analysis:

pip install navis[all]
>>> import navis
>>> import navis.interfaces.neuprint as neu
>>> client = Client("https://neuprint.janelia.org", dataset='male-cns:v1.0', token=token)

>>> skels = neu.fetch_skeletons(neu.NeuronCriteria(type="DNge104"))
>>> skels
<class 'navis.core.neuronlist.NeuronList'> containing 2 neurons (779.2KiB)
            type       name      id  ...  cable_length soma        units
0  navis.TreeNeuron  DNge104_R   12781  ...    1558673.00   10  8 nanometer
1  navis.TreeNeuron  DNge104_L  556329  ...    1690152.25    3  8 nanometer

>>> fig, ax = navis.plot2d(skels, view=('z', 'x'), radius=True)


Please see the navis neuPrint tutorial for more examples. Also check out the flybrains extension package and the corresponding tutorial for transforming spatial data (such as skeletons or meshes) between male CNS space and other common Drosophila template spaces.



This project is a collaboration between FlyEM (HHMI Janelia), the University of Cambridge (Dept. of Zoology), the MRC Laboratory of Molecular Biology, and Google Research.

FlyEM Logo
Cambridge Logo
MRC LMB Logo
Google Research Logo
The Male CNS dataset is licensed under CC-BY.

